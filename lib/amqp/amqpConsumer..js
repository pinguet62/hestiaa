const amqp = require('amqplib')
const logger = require('../logging/logger')('AMQP_Consumer')

class AMQPConsumer {
  constructor (brokerUrl) {
    this.brokerUrl = brokerUrl
    this.initialize()
  }

  initialize () {
    this.exchanges = {}
    process.on('exit', async () => this.close())
    process.on('SIGINT', async () => this.close())
  }

  async connect () {
    logger.info(`Connecting to ${this.channels}`)
    this.connection = await amqp.connect(this.brokerUrl)
    logger.info(`Connected to ${this.channels}`)
  }

  async close () {
    logger.info(`Disconnecting`)

    const channels = []
    Object.values(this.exchanges).forEach(exchange => {
      Object.values(exchange.channels).forEach(channel => {
        channels.push(channel.close())
      })
    })
    await Promise.all(channels)
    await this.connection.close()

    logger.info(`Disconnected`)
  }

  async createChannel (exchangeName, channelName, topic) {
    logger.info(`Creating channel ${channelName} to ${exchangeName}`)

    if (!this.exchanges[exchangeName]) {
      this.exchanges[exchangeName] = { channels: {} }
    }

    if (!this.exchanges[exchangeName].channels[channelName]) {
      const channel = await this.connection.createChannel()
      logger.info(`Channel ${channelName} created`)
      await channel.assertExchange(exchangeName, 'topic', { durable: true })

      const queueName = topic.replace('.', '_')
      channel.assertQueue(queueName, { autoDelete: false })

      channel.bindQueue(queueName, exchangeName, topic)

      this.exchanges[exchangeName].channels[channelName] = channel

      logger.info(`Added the routing path ${topic} from ${exchangeName} to ${channelName}`)
    }

    return this.exchanges[exchangeName].channels[channelName]
  }

  async addHandler (exchangeName, channelName, topic, messageHandler) {
    if (!this.exchanges[exchangeName]) {
      throw Error(`Exchange ${exchangeName} does not exists`)
    }

    const channel = await this.createChannel(exchangeName, channelName, topic)
    if (!channel) {
      throw Error(`Channel  ${channelName} does not exists`)
    }

    const queueName = topic.replace('.', '_')

    await channel.consume(
      queueName,
      async message => {
        await messageHandler(message ? message.content.toString() : null)
        channel.ack(message)
      },
      { noAck: false }
    )
  }
}

module.exports = AMQPConsumer