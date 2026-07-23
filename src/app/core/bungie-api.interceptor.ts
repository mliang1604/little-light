import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { BUNGIE_API } from './bungie';

export const bungieApiInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(BUNGIE_API)) return next(req);

  const headers: Record<string, string> = { 'X-API-Key': environment.bungieApiKey };
  const isTokenRequest = req.url.includes('/App/OAuth/Token');
  const accessToken = inject(AuthService).accessToken;
  if (accessToken && !isTokenRequest) headers['Authorization'] = `Bearer ${accessToken}`;

  return next(req.clone({ setHeaders: headers }));
};
