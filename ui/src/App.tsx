import React, { useState } from 'react';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { Button, Container, Typography, Box } from '@mui/material';
import { Document, Page, pdfjs } from 'react-pdf';
import { enUS } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
//import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import { locales } from './locales';
import { Lockdoc } from './contracts/lockdoc';
import { DefaultProvider, bsv, SensiletSigner, GorillapoolProvider, Addr, toByteString, WhatsonchainProvider } from 'scrypt-ts';
import configDefault from './configDefault.json'

// Worker for PDFjs
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

const apiURL = process.env.REACT_APP_SERVER_URL || configDefault.SERVER_URL;

function bufferToHex(buffer: ArrayBuffer): string {
  const byteArray = new Uint8Array(buffer);
  return Array.from(byteArray).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function fileToHexString(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = function (event: ProgressEvent<FileReader>) {
      if (event.target?.result instanceof ArrayBuffer) {
        const hexString = bufferToHex(event.target.result);
        resolve(hexString);
      } else {
        reject(new Error("Unexpected result type"));
      }
    };

    reader.onerror = function () {
      reject(new Error("Error reading file"));
    };

    reader.readAsArrayBuffer(file);
  });
}

const App: React.FC = () => {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [numPages, setNumPages] = useState<number | null>(null);

  const handleSubmit = async () => {
    // Check if file selected.
    if (file == null) {
      alert('No PDF file selected.');
      return;
    }

    if (selectedDate == null) {
      alert('Time null.');
      return;
    }

    // TODO: Encrypt PDF? Make optional.

    const provider = new WhatsonchainProvider(bsv.Networks.testnet)
    const signer = new SensiletSigner(provider);

    // Request authentication.
    const { isAuthenticated, error } = await signer.requestAuth();
    if (!isAuthenticated) {
      alert(`Failed to authenticate wallet.\n${error.toString()}`);
      return;
    }

    const walletAddr = await signer.getDefaultAddress()

    const instance = new Lockdoc(
      Addr(walletAddr.toByteString()),
      BigInt(Math.floor(selectedDate.getTime() / 1000))
    );

    await instance.connect(signer)

    //const deployResp = await instance.mint({
    //  contentType: 'application/pdf',
    //  content: await fileToHexString(file)
    //})
    const contentTypeBytes = toByteString('application/pdf', true)
    const contentBytes = toByteString(await fileToHexString(file))
    const inscr = bsv.Script.fromASM(
      `OP_FALSE OP_IF 6f7264 OP_1 ${contentTypeBytes} OP_0 ${contentBytes} OP_ENDIF`
    )
    instance.prependNOPScript(inscr)

    const deployResp = await instance.deploy(1)

    console.log('Deployment successful: ', deployResp.id)

    const networkStr = (await signer.getNetwork()) == bsv.Networks.mainnet ? 'main' : 'test'
    setTimeout(() => {
      navigate(`/${networkStr}/${deployResp.id}/0`);
    }, 1000);
  };

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const uploadedFile = event.target.files ? event.target.files[0] : null;
    if (uploadedFile) {
      setFile(uploadedFile);
    }
  }

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    console.log("Number of Pages:", numPages); // Log the number of pages
    setNumPages(numPages);
  }

  // Ensure the selected time is in the future
  const isFutureTime = (date: Date | null) => {
    return date ? date.getTime() > new Date().getTime() : false;
  };

  // Determine browser's locale
  const [locale] = useState(() => {
    const browserLocale = navigator.language.split('-')[0];
    return locales[browserLocale] || enUS; // default to English if the locale isn't supported
  });

  return (
    <Container component="main" maxWidth="md">
      <Box sx={{ mt: 8, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Typography variant="h5" gutterBottom>Upload PDF File</Typography>

        <Box component="form" sx={{ width: '100%', mt: 2, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <input type="file" accept=".pdf" onChange={onFileChange} />
          <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locale}>
            <DatePicker
              label="Pick lock deadline"
              value={selectedDate}
              onChange={(newValue) => isFutureTime(newValue) && setSelectedDate(newValue)}
              sx={{ marginTop: 5 }}
            />
          </LocalizationProvider>
          <Button variant="contained" color="primary" onClick={handleSubmit} sx={{ mt: 2 }}>
            Submit
          </Button>
        </Box>

        {file && (
          <Box sx={{ mt: 4, width: '100%' }}>
            <Typography variant="h6">PDF Preview</Typography>
            <Box sx={{ height: 500, overflowY: 'auto', width: '100%' }}>
              <Document file={file} onLoadSuccess={onDocumentLoadSuccess}>
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
      </Box>
    </Container>
  );
}

export default App;