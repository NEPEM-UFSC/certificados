import { HandlerEvent } from '@netlify/functions';

export function createMockEvent(
  httpMethod: string,
  path: string,
  pathParameters?: { [key: string]: string },
  body?: any,
  queryStringParameters?: { [key: string]: string }
): HandlerEvent {
  const mockEvent: Partial<HandlerEvent> = {
    httpMethod,
    path,
    headers: {
      authorization: 'Bearer test-token', // Adiciona um token padrão para os testes
    },
    body: body && typeof body !== 'string' ? JSON.stringify(body) : body,
    isBase64Encoded: false,
    queryStringParameters: queryStringParameters || {},
  };

  // Adiciona pathParameters diretamente ao objeto após a criação
  (mockEvent as any).pathParameters = pathParameters || {};

  return mockEvent as HandlerEvent;
}