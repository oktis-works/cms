// @oktis-works/admin - Versão exibida no admin (footer + widget "At a Glance")
//
// Fonte única: package.json na raiz do monorepo (a mesma que vira a tag do
// release). Import estático — o Vite inverte o valor em build time, sem I/O.

import rootPkg from '../../../../package.json';

/** Versão do release atual (ex.: "0.4.0"). */
export const APP_VERSION: string = rootPkg.version;
