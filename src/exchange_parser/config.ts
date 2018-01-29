export const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';
export const MYSQL_HOST = process.env.MYSQL_HOST || 'localhost';
export const MYSQL_USER = process.env.MYSQL_USER || 'root';
export const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || 'password';
export const MYSQL_DATABASE = process.env.MYSQL_DATABASE || 'binarytrade';

console.log(MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE);