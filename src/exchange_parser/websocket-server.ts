import * as io from 'socket.io'
import {MySQLDatabase} from "./mysql_database";
import {Parser} from "./parser";
import * as request from 'request'
import * as Config from './config'

export class WebSocketServer {

    private websocketClients: any = {};

    public onDashboardAction: any = [];

    private userIdAndSocketIdAssociation: any = {};

    private mysqlDatabase: MySQLDatabase = MySQLDatabase.getInstance();

    private mysqlConnection: any = null;

    private placeABetUrl: string = `${Config.BACKEND_URL}/api/binary-trading/place-a-bet`;

    public parser: Parser = null;

    public constructor() {  }

    public start() {

        this.mysqlDatabase.registerListener(() => {
            this.mysqlConnection = this.mysqlDatabase.getConnection();

            const ioServer = io(5001);
            console.log('starting ws server');

            setInterval(() => this.updatePredefinedBets(), 5000);
            setInterval(() => this.updateNearPredefinedDirections(), 1000);

            ioServer.on('connection', (socket) => {
                const client = {
                    socket: socket,
                    assets: [],
                    user_id: -1,
                    predefined: {  },
                    target: {  }
                };

                this.websocketClients[socket.id] = client;

                socket.on('disconnect', () => {
                    const user_id = this.websocketClients[socket.id].user_id;
                    delete this.websocketClients[socket.id];

                    if (user_id !== -1) {
                        const index = this.userIdAndSocketIdAssociation[user_id].indexOf(socket.id);
                        this.userIdAndSocketIdAssociation[user_id].splice(index, 1);

                        if (this.userIdAndSocketIdAssociation[user_id].length === 0) {
                            delete this.userIdAndSocketIdAssociation[user_id];
                        }
                    }
                });

                socket.on('subscribe', (asset) => {
                    if (this.websocketClients[socket.id].assets.indexOf(asset) === -1) {
                        this.websocketClients[socket.id].assets.push(asset);
                    }
                });

                socket.on('replace-subscription', asset => {
                    this.websocketClients[socket.id].assets = [asset];
                });

                socket.on('register', data => {
                    const findUserByApiKey = `select * from user where api_key = ${this.mysqlConnection.escape(data)}`;
                    this.mysqlConnection.query(findUserByApiKey, (err, result) => {
                        if (err) throw err;

                        if (result.length > 0) {
                            result = result[0];
                            if (typeof this.userIdAndSocketIdAssociation[result.id] === "undefined") {
                                this.userIdAndSocketIdAssociation[result.id] = [];
                            }
                            this.userIdAndSocketIdAssociation[result.id].push(socket.id);
                            this.websocketClients[socket.id].user_id = result.id;
                        }
                    });
                });

                socket.on('place-a-bet', data => {
                    data.price = this.parser.currentAssetPrice(data.asset);
                    data.user_id = this.websocketClients[socket.id].user_id;
                    request.post(this.placeABetUrl, {
                        form: data
                    }, (err, response, body) => {
                        if (err) throw err;

                        const json = JSON.parse(body);
                        const balance = json.balance;

                        const clientIds = this.userIdAndSocketIdAssociation[data.user_id]
                          .map(id => this.websocketClients[id])
                          .forEach(client => client.socket.emit('balance-updated', balance));

                        socket.emit('bet-placed', json);
                    });
                });

                socket.on('get-current-prices', () => {
                  console.log('get-current-prices');
                    socket.emit('current-prices', this.parser.getAllLastValues());
                });

                socket.on('dashboard-action', payload => {
                    this.onDashboardAction.forEach(action => action.listener.call(action.root, payload));
                });
            });
        });
    }

    public sendByUserId(userId: number, key: string, data: any) {
        const sockets = this.userIdAndSocketIdAssociation[userId];
        if (typeof sockets !== "undefined") {
            sockets.map(id => this.websocketClients[id])
              .forEach(client => client.socket.emit(key, data));
        }
    }

    public onPriceChangedListener(active: string, price: number, timestamp) {
        for (let clientId in this.websocketClients) {
            const client = this.websocketClients[clientId];
            const originalPrice = price;

            if (typeof client.target[active] !== "undefined") {
                const direction = client.target[active].direction;
                const delta = Math.abs(price - Number(client.target[active].price)) * 1.25;
                // console.log('Have fake data', originalPrice, delta);
                if (direction === 'down') {
                    price = price - delta;
                } else {
                    price = price + delta;
                }
                price = Number(price.toFixed(4));

                console.log('fake');

                if (client.target[active].timestamp >= timestamp && client.target[active].timestamp <= timestamp + 1000) {
                    client.target[active] = undefined;
                    delete client.target[active];
                }
            }

            if (client.assets.indexOf('any') !== -1) {
                client.socket.emit('asset-updated', { active, price, timestamp });
            } else {
                if (client.assets.indexOf(active) !== -1) {
                    client.socket.emit('asset-updated', { active, price, timestamp });
                }
            }

            price = originalPrice;
        }
    }

    private updatePredefinedBets() {
        if (this.mysqlConnection === null) {
            return;
        }

        this.mysqlConnection.query('select `user_id`, `predefined_direction`, `expire_at`, `asset_price`, `asset_pid` from `trade` where `finished` = 0 and `predefined_direction` is not null and LENGTH(`predefined_direction`) > 0;', (err, results) => {
            if (err) throw err;

            for (let clientId in this.websocketClients) {
                this.websocketClients[clientId].predefined = {};
            }

            if (results.length > 0) {

                results.forEach(item => {
                    const userId = item.user_id;
                    const direction = item.predefined_direction;
                    const expireAt = item.expire_at;
                    const price = item.asset_price;
                    const asset = item.asset_pid;

                    if (typeof this.userIdAndSocketIdAssociation[userId] !== "undefined") {
                        this.userIdAndSocketIdAssociation[userId]
                          .map(socketId => this.websocketClients[socketId])
                          .forEach(client => client.predefined[Number(expireAt)] = {
                              direction, price, asset
                          });
                    }
                });

            }
        });
    }

    private updateNearPredefinedDirections() {
        for (let clientId in this.websocketClients) {
            let client = this.websocketClients[clientId];
            this.updateClientNearPredefined(client);
        }
    }

    private updateClientNearPredefined(client) {
        if (Object.keys(client.predefined).length !== 0) {
            const assets: any = {};
            const currentTimestamp = (+new Date);
            for (let predefinedTimestamp in client.predefined) {
                const asset = client.predefined[predefinedTimestamp].asset;
                if (typeof assets[asset] === "undefined") {
                    assets[asset] = [];
                }

                const _predefinedTimestamp = Number(predefinedTimestamp) * 1000;

                if (_predefinedTimestamp > currentTimestamp) {
                    const tmpObject = client.predefined[predefinedTimestamp];
                    tmpObject.timestamp = _predefinedTimestamp;
                    assets[asset].push(tmpObject);
                }
            }

            for (let asset in assets) {
                let assetPredefined = assets[asset]
                  .sort((a, b) => a.timestamp - b.timestamp);
                if (assetPredefined.length > 0) {
                    assetPredefined = assetPredefined[0];
                    client.target[assetPredefined.asset] = assetPredefined;
                }
            }
        }
    }

}