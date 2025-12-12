export class Context {
  constructor(canvas = null, debug = false) {
    this.canvas = canvas
    this.debug = Boolean(debug)
  }

  flush() {}

  destroy() {}
}

export default Context
