import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './styles/global.css';
import { HomePage } from './pages/HomePage';
import { JoinPage } from './pages/JoinPage';
import { OrganizerLoginPage } from './pages/OrganizerLoginPage';
import { NavigationPage } from './pages/NavigationPage';
import { AdminLoginPage } from './pages/admin/AdminLoginPage';
import { AdminLayout } from './pages/admin/AdminLayout';
import { AdminNewConvoyPage } from './pages/admin/AdminNewConvoyPage';
import { AdminConvoyPage } from './pages/admin/AdminConvoyPage';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/join" element={<JoinPage />} />
        <Route path="/organizer" element={<OrganizerLoginPage />} />
        <Route path="/navigate" element={<NavigationPage />} />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="convoys/new" replace />} />
          <Route path="convoys/new" element={<AdminNewConvoyPage />} />
          <Route path="convoys/:id" element={<AdminConvoyPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
