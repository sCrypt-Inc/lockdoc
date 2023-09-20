import { OneSatNFT } from 'scrypt-ord'
import {
    method,
    prop,
    assert,
    Addr,
    PubKey,
    Sig,
    pubKey2Addr,
    SigHash,
    SigHashType,
} from 'scrypt-ts'

export class Lockdoc extends OneSatNFT {

    @prop()
    recipient: Addr

    // Lock time can be UNIX timestamp or block height.
    @prop()
    locktime: bigint

    constructor(
        recipient: Addr,
        locktime: bigint
    ) {
        super()
        this.setConstructor(...arguments)
        this.recipient = recipient
        this.locktime = locktime
    }

    @method()
    public unlock(
        pubKey: PubKey,
        sig: Sig 
    ) {
        // Check time lock.
        assert(this.timeLock(this.locktime), 'lock not yet expired')
        
        // Check address and verify signature.
        assert(pubKey2Addr(pubKey) == this.recipient, 'pub key does not belong to address')
        console.log(this.ctx)
        assert(this.checkSig(sig, pubKey), 'signature check failed')
    }

}
