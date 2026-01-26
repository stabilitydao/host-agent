import { daoMetaData, daos } from '@stabilitydao/host';

export function getFullDaos() {
  return daos.map((dao) => ({
    ...dao,
    daoMetaData: daoMetaData[dao.symbol.toLowerCase()],
  }));
}
