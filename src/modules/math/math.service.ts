export default class Service {
  async add({ input }) {
    const [left, right] = input;

    return left + right;
  }

  async subtract({ input }) {
    const [left, right] = input;

    return left - right;
  }

  async multiply({ input }) {
    const [left, right] = input;

    return left * right;
  }

  async divide({ input }) {
    const [left, right] = input;

    return left / right;
  }
}
