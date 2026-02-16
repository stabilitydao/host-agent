import { metaData, daos } from '@stabilitydao/host';

export function getFullDaos() {
  return daos.map((dao) => ({
    ...dao,
    daoMetaData: metaData[dao.symbol.toLowerCase()],
  }));
}
