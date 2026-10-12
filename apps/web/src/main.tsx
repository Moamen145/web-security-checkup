import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from './context/RouterContext.js';
import { AuthProvider } from './context/AuthContext.js';
import { App } from './App.js';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </RouterProvider>
  </React.StrictMode>
);
