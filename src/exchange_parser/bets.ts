import * as mysql from 'mysql'
import * as request from 'request'
import {MySQLDatabase} from "./mysql_database";
import {WebSocketServer} from "./websocket-server";
import * as Config from './config'

export class Bets {

  private connection: any = null;

  private assetsPrices: any = {};

  private updateBalanceUrl: string = `${Config.BACKEND_URL}/api/binary-trading/update-balance`;

  private markAsFinishedUrl: string = `${Config.BACKEND_URL}/api/binary-trading/mark-as-finished`;

  private mysqlDatabase: MySQLDatabase = MySQLDatabase.getInstance();

  private webSocketServer: WebSocketServer = null;

  public start() {
    console.log('started bets processing');

    this.mysqlDatabase.registerListener(() => {
      this.connection = this.mysqlDatabase.getConnection();
      setInterval(() => this.process(), 1000);
    });
  }

  public onAssetUpdated(asset, price, timestamp) {
    if (typeof this.assetsPrices[asset] === "undefined") {
      this.assetsPrices[asset] = [];
    }
    timestamp = Math.floor(timestamp / 1000);
    this.assetsPrices[asset].push({ timestamp, price });
    this.assetsPrices[asset] = this.assetsPrices[asset].slice(-10);
  }

  private process() {
    const timestamp = Math.floor((+new Date) / 1000);
    let sql = 'select * from `trade` where `expire_at` = \'' + mysql.escape(timestamp) + '\' order by `id` desc';
    // sql = 'select * from `trade`';
    this.connection.query(sql, (err, results) => {
      if (err) throw err;
      results.forEach((result) => {
        let price = null;
        let assetPriceNumber = null;
        let priceNumber = null;
        let isUp = null;
        let isDown = null;
        let isSuccess = null;
        let gaining = null;

        if (result.predefined_direction !== null && result.predefined_direction.toString().length > 0) {
          const userDirection = result.direction;
          const predefinedDirection = result.predefined_direction;
          isSuccess = userDirection === predefinedDirection;
        } else {
          price = this.assetsPrices[result.asset_pid].filter(item => {
            return item.timestamp == result.expire_at || item.timestamp == result.expire_at - 1 || item.timestamp == result.expire_at - 2
          }).sort((a, b) => b - a)[0];
          if (price === null) {
            return;
          }


          assetPriceNumber = Number(result.asset_price);
          priceNumber = Number(price.price);

          isUp = assetPriceNumber < priceNumber;
          isDown = assetPriceNumber > priceNumber;

          isSuccess = (isDown && result.direction === 'down') || (isUp && result.direction === 'up');
        }

        request.post(this.markAsFinishedUrl, {
          form: {
            isSuccess: isSuccess,
            tradeId: result.id
          }
        }, (err, response, body) => {
          if (err) {
            console.error(err);
            return;
          }

          const json = JSON.parse(body);
          this.webSocketServer.sendByUserId(result.user_id, 'bet-win', {
            balance: json.balance
          });
        });
      });
    });
  }

  public setWebSocketServer(webSocketServer: WebSocketServer) {
    this.webSocketServer = webSocketServer;
  }

}