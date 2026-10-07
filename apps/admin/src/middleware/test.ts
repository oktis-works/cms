export function onRequest({ locals, next }: any) { locals.test = 'works'; return next(); } SYNTAX ERROR HERE
