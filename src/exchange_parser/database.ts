export interface Database {

    put(key: string, value: any);

    get(key:string): any;

}