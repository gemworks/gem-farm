export enum BankFlags {
  FreezeUnlockedVaults = 1 << 0,
  FreezeLockedVaults = 1 << 1,
  FreezeAllVaults = FreezeUnlockedVaults | FreezeLockedVaults,
}
