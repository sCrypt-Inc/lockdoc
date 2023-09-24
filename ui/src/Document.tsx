import React, { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { Box, Typography, Button } from '@mui/material';
import { Link, useParams } from 'react-router-dom';
import { Document, Page } from 'react-pdf';
import { Addr, ByteString, GorillapoolProvider, MethodCallOptions, Provider, PubKey, SensiletSigner, Sig, SignatureHashType, Utils, WhatsonchainProvider, bsv, byteString2Int, findSig, pubKey2Addr, toByteString } from 'scrypt-ts';
import { Ordinal } from 'scrypt-ord';
import { Lockdoc } from './contracts/lockdoc';
import { format } from 'date-fns';
import { decrypt, deriveKeyFromBigInt, hexToBuffer } from './crypto';


// Margin for locktime to pass to avoid unlocking tx to be marked as non-final.
const LOCKTIME_MARGIN = 10000;


// Convert hex string to Blob
function hexToBlob(hex: string): Blob {
  const len = hex.length;
  const uint8 = new Uint8Array(len / 2);

  for (let i = 0; i < len; i += 2) {
    uint8[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }

  return new Blob([uint8], { type: "application/pdf" });
}

const DocumentPage: React.FC = () => {
  const { network, txid, vout } = useParams();

  const [contractInstance, setContractInstance] = useState<Lockdoc | null>(null);
  const [rawInscription, setRawInscription] = useState<ByteString | null>(null);
  const [pdfURL, setPdfURL] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [lockTime, setLockTime] = useState<Date | null>(null);
  const [withdrawAddress, setWithdrawAddress] = useState<string>('');
  const [originPrefix, setOriginPrefix] = useState<string>('');
  const [inscriptionId, setInscriptionId] = useState<number | null>(null);
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');

  // 2. Create a function to close the notification box
  const closeNotification = () => {
    setShowNotification(false);
    setNotificationMessage('');
  }

  useEffect(() => {
    const onPageLoad = async () => {
      if (txid == undefined) {
        throw new Error('TXID undefined')
      }
      if (vout == undefined) {
        throw new Error('vOut undefined')
      }

      let provider: Provider = new GorillapoolProvider()
      const netw = network == 'main' ? bsv.Networks.mainnet : bsv.Networks.testnet;
      if (netw == bsv.Networks.mainnet) {
        provider = new WhatsonchainProvider(
          bsv.Networks.mainnet
        )
      }
      await provider.connect()
      const tx = await provider.getTransaction(txid)
      const voutNum = Number(vout)

      // TODO: Check MIME type

      // TODO: Don't extract data manually. 
      // https://github.com/sCrypt-Inc/scrypt-ord/issues/6
      // https://github.com/sCrypt-Inc/scrypt-ord/issues/7
      const scriptChunks = tx.outputs[voutNum].script.chunks
      const lsHex = tx.outputs[voutNum].script.toHex()
      const inscription = Ordinal.getInsciptionScript(toByteString(lsHex))
      const lsNoIsncr = lsHex.slice(inscription.length, lsHex.length)

      let pdfHex = scriptChunks[6].buf.toString('hex')
      if (!inscription.startsWith('255044462d')) {
        // TODO: Use some more intelligent way of checking if using encryption.
        try {
          const signer = new SensiletSigner(provider);
          // Request authentication.
          const { isAuthenticated, error } = await signer.requestAuth();
          if (!isAuthenticated) {
            throw new Error(`Failed to authenticate wallet.\n${error.toString()}`);
          }

          const bigIntKey = BigInt(`0x${(await signer.getDefaultPubKey()).toHex()}`); // Just a mock value until signer has encryption support
          const derivedKey = await deriveKeyFromBigInt(bigIntKey);
          pdfHex = await decrypt(derivedKey, hexToBuffer(pdfHex));
        } catch (error) {
          console.error('Failed to use signer to decrypt PDF data', error);
        }
      }

      const pdfBlob = hexToBlob(pdfHex);
      const pdfURL = URL.createObjectURL(pdfBlob);

      const instance = Lockdoc.fromLockingScript(lsNoIsncr) as Lockdoc
      instance.from = {
        txId: tx.id,
        outputIndex: voutNum,
        script: tx.outputs[voutNum].script.toHex(),
        satoshis: 1
      }

      try {
        const response = await fetch(`https://ordinals.gorillapool.io/api/inscriptions/txid/${txid}`, {
          method: 'GET',
          headers: {
            'accept': 'application/json',
          },
        });

        const result = await response.json();
        console.log(result)
        setInscriptionId(result[0].id);
      } catch (error) {
        console.error('Error fetching ordinal metadata:', error);
      }
      
      console.log(instance.utxo)

      setPdfURL(pdfURL)
      setLockTime(new Date(Number(instance.locktime) * 1000))
      setContractInstance(instance)
      setRawInscription(inscription)
      setOriginPrefix(netw == bsv.Networks.mainnet ? 'https://whatsonchain.com/tx/' : 'https://test.whatsonchain.com/tx/')
    };

    onPageLoad();
  }, []);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
  }

  function isSpendable(locktime: Date): boolean {
    const now = new Date();
    const extendedLocktime = new Date(locktime.getTime() + LOCKTIME_MARGIN * 1000);
    return extendedLocktime <= now;
  }

  const handleAddressChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setWithdrawAddress(e.target.value);
  };

  const handleWithdraw = async (e: FormEvent) => {
    e.preventDefault();

    if (!contractInstance) {
      throw new Error('No contract instance')
    }

    const withdrawAddressObj = bsv.Address.fromString(withdrawAddress)

    let provider: Provider = new GorillapoolProvider()
    let signer = new SensiletSigner(provider);

    // TODO: Use DefaultProvider once WoC fixes CORS issue.
    const signerNetwork = await signer.getNetwork()
    if (signerNetwork == bsv.Networks.mainnet) {
      provider = new WhatsonchainProvider(
        bsv.Networks.mainnet
      )
    } else {
      provider = new GorillapoolProvider()
    }

    signer = new SensiletSigner(provider);

    // Request authentication.
    const { isAuthenticated, error } = await signer.requestAuth();
    if (!isAuthenticated) {
      alert(`Failed to authenticate wallet.\n${error.toString()}`);
      return;
    }

    await contractInstance.connect(signer)

    const walletPublicKey = await signer.getDefaultPubKey()

    // Set inscription data in order for preimage to be right.
    contractInstance.prependNOPScript(bsv.Script.fromHex(rawInscription as string))

    contractInstance.bindTxBuilder('unlock',
      async (
        current: Lockdoc,
        options: MethodCallOptions<Lockdoc>
      ) => {
        const unsignedTx: bsv.Transaction = new bsv.Transaction()
          // add contract input
          .addInput(current.buildContractInput())
          // build recipient ordinal output
          .addOutput(
            new bsv.Transaction.Output({
              script: bsv.Script.fromHex(
                Utils.buildAddressScript(Addr(withdrawAddressObj.toByteString()))
              ),
              satoshis: 1,
            })
          )

        if (options.changeAddress) {
          // build change output
          unsignedTx.change(options.changeAddress)
        }

        if (options.lockTime) {
          unsignedTx.setLockTime(options.lockTime)
        }
        unsignedTx.setInputSequence(0, 0)

        return Promise.resolve({
          tx: unsignedTx,
          atInputIndex: 0,
          nexts: [],
        })
      }
    )

    const callRes = await contractInstance.methods.unlock(
      PubKey(walletPublicKey.toByteString()),
      (sigResps) => findSig(sigResps, walletPublicKey),
      {
        lockTime: Math.floor(Date.now() / 1000) - LOCKTIME_MARGIN,
        pubKeyOrAddrToSign: {
          pubKeyOrAddr: walletPublicKey,
        },
        changeAddress: walletPublicKey.toAddress(),
      } as MethodCallOptions<Lockdoc>
    )

    console.log('Unlock successfully called: ', callRes.tx.id)
    setNotificationMessage(`Successfully withdrawn to address ${withdrawAddress}.\nTXID: ${callRes.tx.id}`);
    setShowNotification(true);
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        height: "100vh",
        overflowY: "auto",
        marginTop: "30px"
      }}
    >
      {showNotification && (
        <Box sx={{ width: '100%', backgroundColor: 'lightgreen', padding: '10px', marginBottom: '10px' }}>
          <Typography variant="body1">
            {notificationMessage}
            <Button onClick={closeNotification} sx={{ float: 'right' }}>Close</Button>
          </Typography>
        </Box>
      )}
      <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" width="100%">
        <Typography variant="body1" gutterBottom>
          <b>Origin:</b> <a href={originPrefix + txid}>{txid}</a>
        </Typography>
        {inscriptionId && (
          <Typography variant="body1" gutterBottom>
            <b>Inscription:</b> <a href={'https://1satordinals.com/inscription/' + inscriptionId}>{inscriptionId}</a>
          </Typography>
        )}
        {lockTime && (
          <Typography variant="body1" color="textPrimary">
            <b>Locked until:</b> {format(lockTime, 'MMMM d, yyyy')}
          </Typography>
        )}
        {lockTime && isSpendable(lockTime) && (
          <Box sx={{ mt: 4, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Typography variant="body1" color="textPrimary" sx={{ mb: 2 }}>
              <b>Document can be unlocked!</b>
            </Typography>
            <form onSubmit={handleWithdraw} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <label>
                Bitcoin Address:
                <input
                  type="text"
                  value={withdrawAddress}
                  onChange={handleAddressChange}
                  placeholder="Enter Bitcoin Address"
                  style={{ marginTop: '5px', marginLeft: '5px' }}
                />
              </label>
              <button type="submit">Withdraw</button>
            </form>
          </Box>
        )}
        {pdfURL && (
          <Box sx={{ mt: 4, width: '100%' }}>
            <Typography variant="h6">PDF Preview</Typography>
            <Box sx={{ height: 500, overflowY: 'auto', width: '100%' }}>
              <Document file={pdfURL} onLoadSuccess={onDocumentLoadSuccess}>
                {Array.from(new Array(numPages), (el, index) => (
                  <Page
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                    key={`page_${index + 1}`} pageNumber={index + 1}
                  />
                ))}
              </Document>
            </Box>
          </Box>
        )}
        <Button component={Link} to="/" variant="contained" color="primary">
          Go Back
        </Button>
      </Box>
    </Box>
  );
}

export default DocumentPage;