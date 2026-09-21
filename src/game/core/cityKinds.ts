import type { CityPlan } from './mazeGrid';

/**
 * The twenty kinds of city.
 *
 * Not twenty maps: twenty sets of instructions. The layout still comes from
 * the day's seed, so there are as many cities as there are days — what this
 * list decides is what *kind* of place today is, so that two days running do
 * not feel like the same city with the walls moved.
 *
 * Every one of them is held to the same promise as the plain city: home can
 * be walked to without spending a jump, the same seed draws the same place,
 * and the doorstep is never somewhere you are already sliding. The test
 * beside this file checks all twenty, every time.
 */
export interface CityKind {
    /** Stable id. Never reused for a different kind. */
    key: string;
    label: { ko: string; en: string };
    /** One line, for the menu and the results screen. */
    note: { ko: string; en: string };
    plan: CityPlan;
}

export const CITY_KINDS: CityKind[] = [
    {
        key: 'plain',
        label: { ko: '보통 도시', en: 'Ordinary city' },
        note: { ko: '평소의 골목', en: 'The alleys as they are' },
        plan: {}
    },
    {
        key: 'circle',
        label: { ko: '원형 도시', en: 'Round city' },
        note: { ko: '둥근 성벽 안', en: 'Inside a round wall' },
        plan: { mask: 'circle' }
    },
    {
        key: 'diamond',
        label: { ko: '마름모 도시', en: 'Diamond city' },
        note: { ko: '모서리로 선 도시', en: 'A city stood on its corner' },
        plan: { mask: 'diamond' }
    },
    {
        key: 'cross',
        label: { ko: '십자 도시', en: 'Crossroads' },
        note: { ko: '네 구역이 가운데서만 만남', en: 'Four quarters, joined only in the middle' },
        plan: { mask: 'cross' }
    },
    {
        key: 'tall',
        label: { ko: '좁고 긴 도시', en: 'Narrow city' },
        note: { ko: '옆으로 도망칠 곳이 없음', en: 'Nowhere sideways to run' },
        plan: { mask: 'tall' }
    },
    {
        key: 'ring',
        label: { ko: '고리 도시', en: 'Ring city' },
        note: { ko: '둘러 가거나, 가로질러 가거나', en: 'Round the ring, or straight through' },
        plan: { mask: 'ring' }
    },
    {
        key: 'radial',
        label: { ko: '방사형 도시', en: 'Radial city' },
        note: { ko: '모든 대로가 집으로 향함', en: 'Every avenue points home' },
        plan: { generator: 'radial' }
    },
    {
        key: 'planned',
        label: { ko: '계획 도시', en: 'Planned city' },
        note: { ko: '곧은 벽과 네모난 구획', en: 'Straight walls, square blocks' },
        plan: { generator: 'division' }
    },
    {
        key: 'blocks',
        label: { ko: '블록 도시', en: 'Block city' },
        note: { ko: '주택이 두꺼워 점프로도 못 넘음', en: 'Housing too deep to jump' },
        plan: { generator: 'blocks' }
    },
    {
        key: 'shanty',
        label: { ko: '판자촌', en: 'Shanty town' },
        note: { ko: '아무도 계획하지 않은 골목', en: 'Alleys nobody planned' },
        plan: { generator: 'caves' }
    },
    {
        key: 'perfect',
        label: { ko: '완전미로', en: 'True maze' },
        note: { ko: '돌아 나갈 길이 없음', en: 'No way round, only back' },
        plan: { braid: 0 }
    },
    {
        key: 'plazas',
        label: { ko: '광장 도시', en: 'City of squares' },
        note: { ko: '트인 대신 숨을 곳이 없음', en: 'Open, and nowhere to hide' },
        plan: { plazas: 15 }
    },
    {
        key: 'spiral',
        label: { ko: '나선 도시', en: 'Spiral city' },
        note: { ko: '길은 하나, 멀기만 함', en: 'One street, and a long one' },
        // A smaller city: one street from the edge to the middle is a long
        // walk however big the place is, and at full size it is a walk the
        // rent outlives.
        plan: { generator: 'spiral', size: 31 }
    },
    {
        key: 'grid',
        label: { ko: '격자 도시', en: 'Lattice city' },
        note: { ko: '갈림길뿐이라 방향을 잃음', en: 'Junctions all the way down' },
        plan: { generator: 'prim' }
    },
    {
        key: 'metropolis',
        label: { ko: '대도시', en: 'Metropolis' },
        note: { ko: '한 변 61칸', en: 'Sixty-one cells a side' },
        plan: { size: 61 }
    },
    {
        key: 'town',
        label: { ko: '소도시', en: 'Small town' },
        note: { ko: '초 단위로 갈리는 단거리', en: 'A sprint, decided in seconds' },
        plan: { size: 25 }
    },
    {
        key: 'frost',
        label: { ko: '서리 낀 골목', en: 'Frosted alleys' },
        note: { ko: '군데군데 얼어 있음', en: 'Frozen here and there' },
        plan: { ice: 0.1 }
    },
    {
        key: 'blackice',
        label: { ko: '빙판 도시', en: 'Black ice' },
        note: { ko: '빙판이 지름길이자 함정', en: 'The ice is a short cut and a trap' },
        plan: { ice: 0.3 }
    },
    {
        key: 'glacier',
        label: { ko: '얼어붙은 도시', en: 'Frozen over' },
        note: { ko: '걷는 구간이 드묾', en: 'Walking is the exception' },
        plan: { ice: 0.55 }
    },
    {
        key: 'avenues',
        label: { ko: '결빙 대로', en: 'Frozen avenues' },
        note: { ko: '긴 직선만 얼어 끝까지 미끄러짐', en: 'Only the long straights freeze' },
        plan: { ice: 0.3, iceStyle: 'avenues' }
    }
];

export const kindOf = (key: string): CityKind | undefined =>
    CITY_KINDS.find((kind) => kind.key === key);
