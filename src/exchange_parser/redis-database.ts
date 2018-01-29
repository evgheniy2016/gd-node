import {Database} from "./database";

export class RedisDatabase implements Database {

    private storage: any = {};

    put(key: string, value: any) {
        this.storage[key] = value;
    }

    get(key: string): any {
        return this.storage[key];
    }

}