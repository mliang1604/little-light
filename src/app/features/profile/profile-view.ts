import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  BUNGIE_ROOT,
  CLASS_NAMES,
  PLATFORM_NAMES,
  RACE_NAMES,
  formatNameCode,
} from '../../core/bungie';
import type { DestinyCharacter, DestinyProfile, UserInfoCard } from '../../core/bungie';

@Component({
  selector: 'app-profile-view',
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="profile">
      <header class="profile-header">
        <h2>
          {{ player().bungieGlobalDisplayName
          }}<span class="name-code">{{ nameCode() }}</span>
        </h2>
        <p class="profile-meta">
          {{ platformList() }}
          @if (lastPlayed(); as date) {
            <span> · last played {{ date | date: 'mediumDate' }}</span>
          }
        </p>
      </header>
      @if (characters().length === 0) {
        <p class="empty">This profile is private or has no characters.</p>
      } @else {
        <ul class="characters">
          @for (c of characters(); track c.characterId) {
            <li class="character" [style.background-image]="emblemUrl(c)">
              <div class="character-names">
                <span class="character-class">{{ classNames[c.classType] ?? 'Unknown' }}</span>
                <span class="character-race">{{ raceNames[c.raceType] ?? '' }}</span>
              </div>
              <div class="character-stats">
                <span class="character-light">✦ {{ c.light }}</span>
                <span class="character-hours">{{ hoursPlayed(c) }} h played</span>
              </div>
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class ProfileView {
  readonly player = input.required<UserInfoCard>();
  readonly profile = input.required<DestinyProfile>();

  protected readonly classNames = CLASS_NAMES;
  protected readonly raceNames = RACE_NAMES;

  protected readonly characters = computed(() =>
    Object.values(this.profile().characters.data ?? {}).sort(
      (a, b) => Date.parse(b.dateLastPlayed) - Date.parse(a.dateLastPlayed),
    ),
  );

  protected readonly nameCode = computed(() =>
    formatNameCode(this.player().bungieGlobalDisplayNameCode),
  );

  protected readonly lastPlayed = computed(
    () => this.profile().profile.data?.dateLastPlayed ?? null,
  );

  protected readonly platformList = computed(() => {
    const player = this.player();
    const types = player.applicableMembershipTypes.length
      ? player.applicableMembershipTypes
      : [player.membershipType];
    return types.map((t) => PLATFORM_NAMES[t] ?? `Platform ${t}`).join(' · ');
  });

  protected emblemUrl(character: DestinyCharacter): string {
    return `url(${BUNGIE_ROOT}${character.emblemBackgroundPath})`;
  }

  protected hoursPlayed(character: DestinyCharacter): number {
    return Math.floor(Number(character.minutesPlayedTotal) / 60);
  }
}
