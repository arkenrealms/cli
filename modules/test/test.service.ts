export default class Service {
  async evolution(input, ctx) {
    console.log(ctx);
    ctx.app.run('evolution.info');
  }
}
