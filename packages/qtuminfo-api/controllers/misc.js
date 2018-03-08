const qtuminfo = require('qtuminfo-lib')
const Block = require('qtuminfo-node/lib/models/block')
const Transaction = require('qtuminfo-node/lib/models/transaction')
const {ErrorResponse} = require('../components/utils')
const {Networks} = qtuminfo
const {Base58Check, SegwitAddress} = qtuminfo.encoding

class MiscController {
  constructor(node) {
    this.node = node
    this.errorResponse = new ErrorResponse({log: this.node.log})
    this._network = this.node.network
    if (this.node.network === 'livenet') {
      this._network = 'mainnet'
    } else if (this.node.network === 'regtest') {
      this._network = 'testnet'
    }
  }

  async info(ctx) {
    ctx.body = {
      height: this.node.getBlockTip().height
    }
  }

  async classify(ctx) {
    let id = ctx.params.id
    if (/^(0|[1-9]\d{0,9})$/.test(id)) {
      id = Number.parseInt(id)
      if (id <= this.node.getBlockTip().height) {
        ctx.body = {type: 'block'}
        return
      }
    } else if ([34, 42, 62].includes(id.length)) {
      try {
        let address = this._toHexAddress(id)
        let count = await this.node.getAddressTransactionCount(address)
        if (count > 0) {
          ctx.body = {type: 'address'}
        }
        return
      } catch (err) {}
    } else if (id.length === 40) {
      if (await this.node.getContract(id)) {
        ctx.body = {type: 'contract'}
        return
      }
    } else if (id.length === 64) {
      if (await Block.findOne({hash: id})) {
        ctx.body = {type: 'block'}
        return
      } else if (await Transaction.findOne({$or: [{id}, {hash: id}]})) {
        ctx.body = {type: 'transaction'}
        return
      }
    }
    if (/^[0-9a-z ]+$/i.test(id)) {
      let token = await this.node.searchQRC20Token(id)
      if (token) {
        ctx.body = {type: 'contract', id: token.address}
        return
      }
    }
    ctx.throw(404)
  }

  async richList(ctx) {
    let from = Number.parseInt(ctx.query.from) || 0
    let to = Number.parseInt(ctx.query.to) || from + 10
    ctx.body = await this.node.getRichList({from, to})
  }

  async biggestMiners(ctx) {
    let from = Number.parseInt(ctx.query.from) || 0
    let to = Number.parseInt(ctx.query.to) || from + 10
    ctx.body = await this.node.getMiners({from, to})
  }

  _toHexAddress(address) {
    let network = Networks.get(this._network)
    if (address.length === 34) {
      let hexAddress = Base58Check.decode(address)
      if ([network.pubkeyhash, network.scripthash].includes(hexAddress[0])) {
        return hexAddress.slice(1).toString('hex')
      }
    } else if (address.length === 42) {
      let result = SegwitAddress.decode(network.witness_v0_keyhash, address)
      if (result) {
        return Buffer.from(result.program).toString('hex')
      }
    } else if (address.length === 62) {
      let result = SegwitAddress.decode(network.witness_v0_scripthash, address)
      if (result) {
        return Buffer.from(result.program).toString('hex')
      }
    }
    throw new Error('Invalid address')
  }
}

module.exports = MiscController
