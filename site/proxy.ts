import { NextRequest, NextResponse } from 'next/server';

export function proxy(request: NextRequest) {
  if (
    request.nextUrl.pathname !== '/crm/login'
    && !request.cookies.has('sweet_shop_session')
  ) {
    return NextResponse.redirect(new URL('/crm/login', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/crm/:path*'],
};

