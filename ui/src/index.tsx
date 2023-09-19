import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import DocumentPage from './Document';
import { Container } from '@mui/material';

import { Lockdoc } from './contracts/lockdoc';
import artifact from '../artifacts/lockdoc.json';
Lockdoc.loadArtifact(artifact);

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
    <Router>
      <Container component="main" maxWidth="md">
        <Routes>
          <Route path="/:network/:txid/:vout" element={<DocumentPage />} />
          <Route path="/" element={<App />} />
        </Routes>
      </Container>
    </Router>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
