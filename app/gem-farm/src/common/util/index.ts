import moment from 'moment/moment';
import { BN } from '@project-serum/anchor';
import { toBN } from '@gemworks/gem-farm-ts';

export function removeManyFromList(toRemove: any[], fromList: any[]) {
  toRemove.forEach((i) => {
    const index = fromList.indexOf(i);
    if (index > -1) {
      fromList.splice(index, 1);
    }
  });
}

//returns stuff in list1 but not in list2
export function getListDiff(list1: any[], list2: any[]): any[] {
  return list1.filter((i) => !list2.includes(i));
}

export function getListDiffBasedOnMints(list1: any[], list2: any[]): any[] {
  const list1Mints = list1.map((i) => i.mint.toBase58());
  const list2Mints = list2.map((i) => i.mint.toBase58());

  const diff = getListDiff(list1Mints, list2Mints);

  return list1.filter((i) => diff.includes(i.mint.toBase58()));
}

export function parseDate(unixTsSec: number | string | BN) {
  const unixBN = toBN(unixTsSec);
  if (unixBN.eq(new BN(0))) {
    return '--';
  }

  const dateObj = new Date(unixBN.mul(new BN(1000)).toNumber());
  return moment(dateObj).format('MMM Do YY, h:mm a');
}
