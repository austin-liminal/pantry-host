import postgres from 'postgres';

let _sql: ReturnType<typeof postgres> | undefined;

function getSql() {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL environment variable is not set');
    _sql = postgres(url, { max: 10 });
  }
  return _sql;
}

const handler: ProxyHandler<object> = {
  apply(_target, thisArg, args) {
    return Reflect.apply(getSql() as never, thisArg, args);
  },
  get(_target, prop) {
    return Reflect.get(getSql() as never, prop);
  },
};

const sql = new Proxy(function () {}, handler) as ReturnType<typeof postgres>;

export default sql;
