import { Parser } from './exchange_parser/parser'
import { RedisDatabase } from "./exchange_parser/redis-database";
import { WebSocketServer } from "./exchange_parser/websocket-server"
import { Database } from "./exchange_parser/database";
import { Bets } from './exchange_parser/bets'
import * as Config from './exchange_parser/config'
import * as fs from 'fs'

if (!fs.existsSync(Config.PARSER_CACHE_FILE)) {
    fs.openSync(Config.PARSER_CACHE_FILE, 'w');
}

const database: Database = new RedisDatabase();
const parser: Parser = new Parser(database);
const websocketServer: WebSocketServer = new WebSocketServer();
const bets: Bets = new Bets();

bets.setWebSocketServer(websocketServer);

parser.onPriceChanged.push({ listener: websocketServer.onPriceChangedListener, root: websocketServer });
parser.onPriceChanged.push({ listener: bets.onAssetUpdated, root: bets });

websocketServer.parser = parser;

setTimeout(() => websocketServer.start(), 1);
setTimeout(() => parser.start(), 1);
setTimeout(() => bets.start(), 1);
