import React, { useEffect, useState } from 'react';
import { Box, Typography, Button } from '@mui/material';
import { Link, useParams } from 'react-router-dom';
import { Document, Page } from 'react-pdf';
import { GorillapoolProvider, bsv, byteString2Int, toByteString } from 'scrypt-ts';
import { Ordinal } from 'scrypt-ord';
import { Lockdoc } from './contracts/lockdoc';
import { format } from 'date-fns';


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

  const [pdfURL, setPdfURL] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [lockTime, setLockTime] = useState<Date | null>(null);

  useEffect(() => {
    const onPageLoad = async () => {
      if (txid == undefined) {
        throw new Error('TXID undefined')
      }
      if (vout == undefined) {
        throw new Error('vOut undefined')
      }

      const netw = network == 'main' ? bsv.Networks.mainnet : bsv.Networks.testnet;
      const provider = new GorillapoolProvider();
      await provider.connect()


      const tx = await provider.getTransaction(txid)
      const voutNum = Number(vout)

      // const inscrScript = Ordinal.getInsciptionScript(toByteString(tx.outputs[voutNum].script.toHex()))

      // TODO: Check MIME type

      // TODO: Don't extract data manually. 
      // https://github.com/sCrypt-Inc/scrypt-ord/issues/6
      // https://github.com/sCrypt-Inc/scrypt-ord/issues/7
      const scriptChunks = tx.outputs[voutNum].script.chunks

      const locktime = byteString2Int(toByteString(scriptChunks[12].buf.toString('hex')))
      const pdfHex = scriptChunks[6].buf.toString('hex')

      const pdfBlob = hexToBlob(pdfHex);
      const pdfURL = URL.createObjectURL(pdfBlob);

      setPdfURL(pdfURL)
      setLockTime(new Date(Number(locktime) * 1000))
    };

    onPageLoad();
  }, []);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
  }

  return (
    <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height="100vh">
      <Typography variant="body1" gutterBottom>
        <b>Origin:</b> {txid}
      </Typography>
      {lockTime && (
        <Typography variant="body1" color="textPrimary">
          <b>Locked until:</b> {format(lockTime, 'MMMM d, yyyy')}
        </Typography>
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
  );
}

export default DocumentPage;