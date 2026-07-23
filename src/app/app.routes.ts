import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/search/search-page').then((m) => m.SearchPage),
    title: 'Little Light — Guardian lookup',
  },
  {
    path: 'me',
    loadComponent: () => import('./features/me/me-page').then((m) => m.MePage),
    title: 'Little Light — Your Guardian',
  },
  {
    path: 'auth/callback',
    loadComponent: () => import('./features/auth/callback-page').then((m) => m.CallbackPage),
    title: 'Little Light — Signing in',
  },
  { path: '**', redirectTo: '' },
];
