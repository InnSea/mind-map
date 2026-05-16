class Ai {
  constructor() {
    this.controller = null
    this.currentChunk = ''
    this.content = ''
  }

  async request(data, progress = () => {}, end = () => {}, err = () => {}) {
    try {
      const res = await this.postMsg(data)
      const decoder = new TextDecoder()
      while (1) {
        const { done, value } = await res.read()
        if (done) {
          return
        }
        const text = decoder.decode(value)
        let chunk = this.handleChunkData(text)
        if (this.currentChunk) continue
        let isEnd = false
        const list = chunk
          .split('\n')
          .filter(item => {
            isEnd = item.includes('[DONE]')
            return !!item && !isEnd
          })
          .map(item => {
            return JSON.parse(item.replace(/^data:/, ''))
          })
        list.forEach(item => {
          this.content += item.choices
            .map(item2 => {
              return item2.delta.content
            })
            .join('')
        })
        progress(this.content)
        if (isEnd) {
          end(this.content)
        }
      }
    } catch (error) {
      console.log(error)
      if (!(error && error.name === 'AbortError')) {
        err(error)
      }
    }
  }

  async postMsg(data) {
    this.controller = new AbortController()
    const res = await fetch('https://test.classtorch.com/api/ai/chat', {
      signal: this.controller.signal,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data),
      timeout: 60000
    })
    if (res.status && res.status !== 200) {
      throw new Error('请求失败')
    }
    return res.body.getReader()
  }

  handleChunkData(chunk) {
    chunk = chunk.trim()
    if (this.currentChunk) {
      chunk = this.currentChunk + chunk
      this.currentChunk = ''
    }
    if (chunk.includes('[DONE]')) {
      return chunk
    }
    if (chunk[chunk.length - 1] !== '}') {
      this.currentChunk = chunk
    }
    return chunk
  }

  stop() {
    if (this.controller) {
      this.controller.abort()
    }
    this.controller = new AbortController()
  }
}

export default Ai
