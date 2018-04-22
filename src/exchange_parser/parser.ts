import * as fs from 'fs';

import {Database} from "./database";
import * as request from 'request'
import * as WebSocket from 'ws'
import * as Config from './config'

export class Parser {
    public onPriceChanged: any[] = [];

    private number: number = 600;

    private wsUrl = `wss://stream170.forexpros.com/echo/${this.number}/53ptm0sl/websocket`;

    private lastValues: any = {};

    private getAssetsUrl: string = `${Config.BACKEND_URL}/api/assets/list`;

    private assets: number[] = [];

    private wsConnection: any = null;

    public constructor(private database: Database) {
      fs.readFile(process.cwd() + '/' + Config.PARSER_CACHE_FILE, 'utf8', (err, content) => {
          if (err) throw err;

          if (content.length > 0) {
            content = JSON.parse(content);
            this.lastValues = content;
          }
      });

      setInterval(() => {
          fs.writeFile(process.cwd() + '/' + Config.PARSER_CACHE_FILE, JSON.stringify(this.lastValues), (err) => {
            if (err) {
                console.error(`Can't save last values to cache file`);
            } else {
                console.log('Last values successfully written to cache');
            }
          });
      }, 1000 * 60 * 5); // each 5 minutes
    }

    public start() {
        console.log('started parser');

        request.get(this.getAssetsUrl, (error, response, body) => this.processAssetsList(body));

        setInterval(() => this.updateAssets(), 5000);
    }

    private createParserConnection() {
        request({
            url: 'https://stream170.forexpros.com/echo/info',
            json: true
        }, (error, response, body) => {
            if (!error && response.statusCode === 200) {
                const ws = new WebSocket(this.wsUrl, {
                    perMessageDeflate: true
                });
                this.wsConnection = ws;

                ws.onopen = () => {
                    console.log('Connected');
                    setInterval(function () {
                        if (ws.readyState === ws.OPEN) {
                            ws.send('["{\\"_event\\":\\"heartbeat\\",\\"data\\":\\"h\\"}"]')
                        }
                    }, 3000);
                };

                ws.onmessage = (message) => {
                    let data = message.data;
                    if (data === 'o') {
                        for (let asset of this.assets) {
                            ws.send(`["{\\"_event\\":\\"subscribe\\",\\"tzID\\":55,\\"message\\":\\"pid-${asset}:\\"}"]`);
                        }
                    } else {
                        // removing first symbol(in messages with data - 'a')
                        let messageWrapper = data.substr(1);
                        // removing first and last bracket([ and ])
                        messageWrapper = messageWrapper.substr(1).substr(0, messageWrapper.length - 2);
                        try {
                            messageWrapper = JSON.parse(messageWrapper);
                        } catch (e) {
                            console.error(`Can't parse message: ${messageWrapper}`);
                            console.error(e);
                            this.wsConnection.close();

                            return;
                        }

                        if (typeof messageWrapper === "string") {
                            messageWrapper = JSON.parse(messageWrapper);
                            console.log(messageWrapper);
                            if (typeof messageWrapper.message !== "undefined") {
                                messageWrapper = messageWrapper.message;
                                try {
                                    messageWrapper = messageWrapper.split('::');
                                } catch (e) {
                                    console.error(e);
                                }

                                let messageBody = messageWrapper[1];

                                const messageBodyParsed = JSON.parse(messageBody);
                                const pid = messageBodyParsed.pid;
                                const price = messageBodyParsed.last_numeric;
                                const timestamp = typeof messageBody.timestamp !== "undefined" ?  messageBody.timestamp : (+new Date);

                                this.lastValues['pid-' + pid] = price;

                                // this.redisClient.set('pid-' + pid, price);
                                this.onPriceChanged
                                  .forEach(callback => callback.listener.call(callback.root, 'pid-' + pid, price, timestamp));
                            } else {
                                /// todo: empty
                            }
                        }
                    }
                };

                ws.onerror = function (error) {
                    console.error(error);
                };

                ws.onclose = (e) => {
                    console.log('Disconnected. Reconnecting...');
                    this.createParserConnection();
                };

            }
        });
    }

    public currentAssetPrice(asset: string) {
        return this.lastValues[asset];
    }

    public getAllLastValues() {
        return this.lastValues;
    }

    private processAssetsList(body: any) {
        try {
          const assetsResponse = JSON.parse(body);
          if (typeof assetsResponse.response === "undefined") {
            throw "Response is undefined";
          }

          const assets = assetsResponse.assets;
          assets.forEach(asset => this.assets.push(asset));

          this.createParserConnection();

          setInterval(() => {
            const timestamp = (+ new Date());

            for (let pid in this.lastValues) {
              let value = this.lastValues[pid];
              this.onPriceChanged
                .forEach(callback => callback.listener.call(callback.root, pid, value, timestamp));
            }
          }, 1000);
        } catch (e) {
            console.log(e.message);
        }
    }

    private updateAssets() {
        request.get(this.getAssetsUrl, (error, response, body) => {
            let assetsResponse = null;
            try {
                assetsResponse = JSON.parse(body);
            } catch (e) {
                console.log("Can't parse page content: " + body);
                return;
            }

            if (typeof assetsResponse.response === "undefined") {
                throw "Response is undefined";
            }

            const assets = assetsResponse.assets;
            assets.forEach(asset => {
                if (this.assets.indexOf(asset) === -1) {
                    this.assets.push(asset);

                    if (this.wsConnection !== null) {
                        this.wsConnection.send(`["{\\"_event\\":\\"subscribe\\",\\"tzID\\":55,\\"message\\":\\"pid-${asset}:\\"}"]`);
                    }
                }
            });
        });
    }

}
