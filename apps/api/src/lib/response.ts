import type { Response } from 'express';

/** PRD Appendix E.18 — Error Codes. */
export type ErrorCode =
  | 'AUTH_001'
  | 'AUTH_002'
  | 'AUTH_003'
  | 'CART_001'
  | 'CART_002'
  | 'MATCH_001'
  | 'MATCH_002'
  | 'PAYMENT_001'
  | 'PAYMENT_002'
  | 'ORDER_001'
  | 'DELIVERY_001'
  | 'QR_001'
  | 'QR_002'
  | 'QR_003'
  | 'QR_004'
  | 'QR_005'
  | 'QR_006'
  | 'QR_007'
  | 'VALIDATION_001'
  | 'HOSTEL_001'
  | 'SYSTEM_001';

const STATUS_FOR_CODE: Record<ErrorCode, number> = {
  AUTH_001: 401,
  AUTH_002: 401,
  AUTH_003: 403,
  CART_001: 400,
  CART_002: 409,
  MATCH_001: 404,
  MATCH_002: 408,
  PAYMENT_001: 402,
  PAYMENT_002: 408,
  ORDER_001: 404,
  DELIVERY_001: 400,
  QR_001: 400,
  QR_002: 410,
  QR_003: 403,
  QR_004: 409,
  QR_005: 409,
  QR_006: 409,
  QR_007: 400,
  VALIDATION_001: 422,
  HOSTEL_001: 409,
  SYSTEM_001: 500,
};

/** PRD Appendix E.16 — Standard Response Format. */
export function ok<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ success: true, data });
}

export function created<T>(res: Response, data: T) {
  return ok(res, data, 201);
}

export function noContent(res: Response) {
  return res.status(204).send();
}

export function fail(res: Response, code: ErrorCode, message: string) {
  return res.status(STATUS_FOR_CODE[code]).json({
    success: false,
    error: { code, message },
  });
}

export class ApiError extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}
