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
