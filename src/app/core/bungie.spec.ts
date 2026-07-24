import {
  formatNameCode,
  parseBungieName,
  pickPrimaryMembership,
  usableMemberships,
} from './bungie';
import type { UserInfoCard } from './bungie';

describe('parseBungieName', () => {
  it('parses a standard Bungie Name', () => {
    expect(parseBungieName('Guardian#1234')).toEqual({
      displayName: 'Guardian',
      displayNameCode: 1234,
    });
  });

  it('parses codes with leading zeros', () => {
    expect(parseBungieName('Datto#0714')).toEqual({ displayName: 'Datto', displayNameCode: 714 });
  });

  it('splits on the last # when the name itself contains one', () => {
    expect(parseBungieName('a#b#42')).toEqual({ displayName: 'a#b', displayNameCode: 42 });
  });

  it('trims whitespace around name and code', () => {
    expect(parseBungieName('  Guardian #1234 '.replace(' #', '#'))).toEqual({
      displayName: 'Guardian',
      displayNameCode: 1234,
    });
  });

  it.each(['Guardian', '#1234', 'Guardian#', 'Guardian#12ab', ''])(
    'rejects invalid input %j',
    (input) => {
      expect(parseBungieName(input)).toBeNull();
    },
  );
});

describe('formatNameCode', () => {
  it('zero-pads to four digits', () => {
    expect(formatNameCode(714)).toBe('#0714');
    expect(formatNameCode(1234)).toBe('#1234');
  });

  it('returns empty string for missing codes', () => {
    expect(formatNameCode(undefined)).toBe('');
  });
});

function card(overrides: Partial<UserInfoCard>): UserInfoCard {
  return {
    membershipType: 3,
    membershipId: 'id',
    bungieGlobalDisplayName: 'Guardian',
    crossSaveOverride: 0,
    applicableMembershipTypes: [3],
    ...overrides,
  };
}

describe('usableMemberships', () => {
  it('keeps every account when cross save is off', () => {
    const xbox = card({ membershipType: 1, membershipId: 'x' });
    const steam = card({ membershipType: 3, membershipId: 's' });
    expect(usableMemberships([xbox, steam])).toEqual([xbox, steam]);
  });

  it('keeps only the primary platform when cross save is on', () => {
    const xboxShell = card({ membershipType: 1, membershipId: 'x', crossSaveOverride: 3 });
    const steamPrimary = card({ membershipType: 3, membershipId: 's', crossSaveOverride: 3 });
    expect(usableMemberships([xboxShell, steamPrimary])).toEqual([steamPrimary]);
  });
});

describe('pickPrimaryMembership', () => {
  it('returns null for no memberships', () => {
    expect(pickPrimaryMembership([])).toBeNull();
  });

  it('returns the only membership when there is no cross save', () => {
    const only = card({ membershipId: 'a' });
    expect(pickPrimaryMembership([only])).toBe(only);
  });

  it('prefers the membership matching primaryMembershipId', () => {
    const xbox = card({ membershipType: 1, membershipId: 'x' });
    const steam = card({ membershipType: 3, membershipId: 's' });
    expect(pickPrimaryMembership([xbox, steam], 's')).toBe(steam);
  });

  it('falls back to the crossSaveOverride platform', () => {
    const xbox = card({ membershipType: 1, membershipId: 'x', crossSaveOverride: 3 });
    const steam = card({ membershipType: 3, membershipId: 's', crossSaveOverride: 3 });
    expect(pickPrimaryMembership([xbox, steam])).toBe(steam);
  });

  it('falls back to the first membership otherwise', () => {
    const a = card({ membershipId: 'a' });
    const b = card({ membershipId: 'b' });
    expect(pickPrimaryMembership([a, b], 'missing')).toBe(a);
  });
});
