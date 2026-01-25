import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : exception instanceof Error
        ? exception.message
        : 'Internal server error';

    // In development, include stack trace
    const isDevelopment = process.env.NODE_ENV !== 'production';
    
    // Handle ValidationPipe errors
    let errorResponse: any = {
      statusCode: status,
      message: typeof message === 'string' ? message : (message as any).message || 'Internal server error',
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    // If it's a validation error, include the validation details
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === 'object' && response !== null) {
        const resp = response as any;
        if (resp.message && Array.isArray(resp.message)) {
          // This is a ValidationPipe error
          errorResponse.message = resp.message;
        } else if (resp.message) {
          errorResponse.message = resp.message;
        }
      }
    }

    if (isDevelopment && exception instanceof Error) {
      errorResponse.error = exception.message;
      errorResponse.stack = exception.stack;
    }

    console.error(`[ExceptionFilter] ${request.method} ${request.url} - ${status}`, {
      message: errorResponse.message,
      error: exception instanceof Error ? exception.message : 'Unknown error',
      stack: exception instanceof Error ? exception.stack : undefined,
    });

    response.status(status).json(errorResponse);
  }
}

