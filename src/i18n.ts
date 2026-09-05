import { useEffect, useState } from 'react';
import { getSettings, subscribe } from './settings';
import type { Language } from './settings';

/**
 * Every word the game says, in both languages.
 *
 * One flat dictionary rather than per-component files: there are only a couple
 * of hundred strings and keeping them together is what makes it possible to see
 * that a line has been translated, or hasn't.
 *
 * The in-game writing is here too — the tutorial, the cat's asides, the ending.
 * Those are the two thirds of the text that carry the game's voice, so leaving
 * them out would have made the language switch cosmetic.
 */
type Dict = Record<string, string>;

const ko: Dict = {
    // ---------------------------------------------------------------- menu
    'menu.start': 'GAME START',
    'menu.ranking': '랭킹 / RANKING',
    'menu.settings': '설정 / SETTINGS',

    // ------------------------------------------------------------ settings
    'settings.eyebrow': 'SETTINGS',
    'settings.title': '설정',
    'settings.sound': '소리 / SOUND',
    'settings.on': '켬 / ON',
    'settings.off': '끔 / OFF',
    'settings.language': '언어 / LANGUAGE',
    'settings.difficulty': '난이도 / DIFFICULTY',
    'settings.appearance': '화면 / APPEARANCE',
    'settings.dark': '어둡게',
    'settings.light': '밝게',
    'settings.close': '닫기 / CLOSE',

    // -------------------------------------------------------------- header
    'header.score': 'SCORE',
    'header.restart': '다시 시작 / Restart',
    'header.mute': '소리 끄기 / Mute',
    'header.unmute': '소리 켜기 / Unmute',

    // --------------------------------------------------------- leaderboard
    'board.fastest': '빨리 도달한 냥',
    'board.fastest.eyebrow': 'FASTEST HOME',
    'board.survived': '가장 오래 돌아다닌 냥',
    'board.survived.eyebrow': 'LONGEST ON THE STREET',
    'board.fed': '가장 많이 먹은 냥',
    'board.fed.eyebrow': 'BEST FED',
    'board.closest': '가장 아슬아슬했던 냥',
    'board.closest.eyebrow': 'CLOSEST CALL',
    'board.weighted': '순위는 난이도를 반영해 환산한 값 기준입니다.',
    'board.loading': '불러오는 중…',
    'board.failed': '기록을 불러오지 못했습니다.',
    'board.empty': '아직 기록이 없습니다. 첫 번째가 되어 보세요.',
    'board.close': '닫기 / CLOSE',

    // ----------------------------------------------------------- game over
    'over.eyebrow': 'RUN ENDED',
    'over.health.title': '버티지 못했다',
    'over.health.body': '월세와 생활비가 남은 것을 다 가져갔습니다. 생선은 모아 둘 수 없습니다.',
    'over.enemy.title': '붙잡혔다',
    'over.enemy.body': '버틸 수 있는 만큼은 버텼습니다. 그 다음은 없었습니다.',
    'over.apartment:player.title': '밀려날 곳이 없었다',
    'over.apartment:player.body':
        '짓눌린 것이 아닙니다. 밀려나고 또 밀려나다, 물러설 자리가 사라졌을 뿐입니다.',
    'over.apartment:goal.title': '집이 먼저 사라졌다',
    'over.apartment:goal.body': '도착하기 전에 그 자리에 아파트가 들어섰습니다.',
    'over.trapped.title': '갈 곳이 없었다',
    'over.trapped.body': '사방이 막혔습니다. 체력이 남아 있어도 나갈 길이 없으면 끝난 것입니다.',
    'over.sealed.title': '길이 끊겼다',
    'over.sealed.body': '집은 아직 저기 있습니다. 다만 거기까지 가는 길이 모두 아파트가 되었습니다.',
    'over.idle.title': '움직이지 않았다',
    'over.idle.body': '가만히 서 있는 동안에도 월세는 나갔습니다. 도시는 기다려 주지 않습니다.',
    'over.score': 'SCORE',
    'over.fish': '🐟 FISH',
    'over.milk': '🥛 MILK',
    'over.name': '이름 / YOUR NAME',
    'over.submit': '기록 등록 / SUBMIT',
    'over.submitting': '전송 중…',
    'over.submitted': '기록 등록 완료 / SUBMITTED',
    'over.partial': '점수만 등록됨 — 생존·생선 기록은 저장되지 않았습니다',
    'over.retry': '다시 / RETRY',
    'over.ranking': '랭킹',
    'over.spaceHint': 'SPACE 로도 다시 시작합니다',
    'over.saveFailed': '기록을 저장하지 못했습니다. 다시 시도해 주세요.',

    // ------------------------------------------------------------- victory
    'win.title': '집에 닿았다',
    'win.submit': '기록 등록 / SUBMIT TIME',

    // ------------------------------------------------------------ tutorial
    'tut.move.speaker': '· 이동',
    'tut.move': '당신은 길고양이입니다. 방향키로 골목을 걸어 다닐 수 있습니다.',
    'tut.move.touch': '당신은 길고양이입니다. 왼쪽 아래 스틱으로 골목을 걸어 다닐 수 있습니다.',
    'tut.goal.speaker': '· 집',
    'tut.goal': '저기 도시 한가운데가 당신의 집입니다. 노란 화살표가 늘 그쪽을 가리킵니다.',
    'tut.fish.speaker': '· 생선',
    'tut.fish': '생선은 체력을 채워 줍니다. 모아 둘 수는 없고, 계속 구해야 합니다.',
    'tut.milk.speaker': '· 우유',
    'tut.milk': '우유를 마시면 방향대로 점프할 수 있습니다.',
    'tut.apartment.speaker': '· 재개발',
    'tut.apartment': '노란 줄은 아파트가 들어서는 자리입니다. 피하세요.',
    'tut.health.speaker': '· 체력',
    'tut.health': '체력은 가만히 있어도 줄어듭니다. 머리 위 막대가 당신에게 남은 시간입니다.',
    'tut.start.speaker': '· 시작',
    'tut.start': '자, 이제 집까지 가세요!',
    'tut.skip': 'SKIP ▸',
    'tut.hint': '▸ ENTER / CLICK',
    'tut.enemy.speaker': '· ?',
    'tut.enemy': '인생은 뜻하지 않은 위기가 도사리지 캬캬',

    // --------------------------------------------------------------- barks
    'bark.firstTower': '재개발이 시작되는구나!',
    'bark.tower': '또 하나 올라갔어...|여기도 아파트야?|내 골목 내놔!|어? 길이 없어졌잖아|아니 저기 내 자리인데|이러다 앉을 데도 없겠다',
    'bark.panic':
        '살려줘! 도망가!|아오 %$#%!|$@#^%#&*!|왜 나만 쫓아와!|헉헉... 안 돼!|@#$%! 저리 가!|어어어 오지 마!',
    'bark.hurt': '아야!|#$%@!|아 진짜!',
    'bark.idle':
        '여긴 또 어디야...|월세가 또 올랐대|집이 있으면 좋겠다|보증금이 뭔데 그렇게 비싸|배고파...|다리 아파|이 골목 아까 왔는데?|내 방 한 칸이면 되는데|따뜻한 데서 자고 싶다|여기 원래 우리 동네였는데',
    'bark.taunt':
        '캬캬캬|어디 가시나~|집은 있고?|월세나 내라옹|거기 서라옹|보증금 5억이다냥|재개발은 못 참지|도망가봐야 소용없다냥|여긴 이제 내 구역이다',

    // -------------------------------------------------------------- ending
    'ending.1': 'Life begins without a rehearsal.\n인생은 리허설 없이 시작된다.',
    'ending.2': 'Using the rough waves of anxiety as our drive\n불안이라는 거친 파도를 동력 삼아',
    'ending.3': 'we simply plunge toward an unknown point.\n우리는 그저 미지의 점을 향해 뛰어든다.',
    'ending.4': 'Even if I were to open my eyes again,\n내가 다시 눈을 뜬다 해도,',
    'ending.5': 'my choice remains the repetition of this very life.\n나의 선택은 바로 이 삶의 반복이다.',
    'ending.skip': '▸  SKIP  /  건너뛰기',
    'credits.return': '▸  SKIP  /  건너뛰기'
};

const en: Dict = {
    'menu.start': 'GAME START',
    'menu.ranking': 'RANKING',
    'menu.settings': 'SETTINGS',

    'settings.eyebrow': 'SETTINGS',
    'settings.title': 'Settings',
    'settings.sound': 'SOUND',
    'settings.on': 'ON',
    'settings.off': 'OFF',
    'settings.language': 'LANGUAGE',
    'settings.difficulty': 'DIFFICULTY',
    'settings.appearance': 'APPEARANCE',
    'settings.dark': 'DARK',
    'settings.light': 'LIGHT',
    'settings.close': 'CLOSE',

    'header.score': 'SCORE',
    'header.restart': 'Restart',
    'header.mute': 'Mute',
    'header.unmute': 'Unmute',

    'board.fastest': 'Fastest Home',
    'board.fastest.eyebrow': 'FASTEST HOME',
    'board.survived': 'Longest On The Street',
    'board.survived.eyebrow': 'LONGEST ON THE STREET',
    'board.fed': 'Best Fed',
    'board.fed.eyebrow': 'BEST FED',
    'board.closest': 'Closest Call',
    'board.closest.eyebrow': 'CLOSEST CALL',
    'board.weighted': 'Ranked on values adjusted for difficulty.',
    'board.loading': 'Loading…',
    'board.failed': 'Could not load the records.',
    'board.empty': 'No records yet. Be the first.',
    'board.close': 'CLOSE',

    'over.eyebrow': 'RUN ENDED',
    'over.health.title': 'You could not hold out',
    'over.health.body': 'Rent and the cost of living took what was left. Fish do not keep.',
    'over.enemy.title': 'Caught',
    'over.enemy.body': 'You took what you could. There was nothing left after that.',
    'over.apartment:player.title': 'Nowhere left to be pushed',
    'over.apartment:player.body':
        'Nothing crushed you. You were moved along, and moved along, until there was no along left.',
    'over.apartment:goal.title': 'Home went first',
    'over.apartment:goal.body': 'A tower went up on it before you got there.',
    'over.sealed.title': 'The way is gone',
    'over.sealed.body': 'Home is still standing. Every road to it has become an apartment block.',
    'over.idle.title': 'You stopped moving',
    'over.idle.body': 'Rent went out while you stood still. The city does not wait.',
    'over.trapped.title': 'Nowhere to go',
    'over.trapped.body':
        'Walled in on every side. Health left over counts for nothing with no way out.',
    'over.score': 'SCORE',
    'over.fish': '🐟 FISH',
    'over.milk': '🥛 MILK',
    'over.name': 'YOUR NAME',
    'over.submit': 'SUBMIT',
    'over.submitting': 'Sending…',
    'over.submitted': 'SUBMITTED',
    'over.partial': 'Score only — survival and fish were not saved',
    'over.retry': 'RETRY',
    'over.ranking': 'RANKING',
    'over.spaceHint': 'SPACE also restarts',
    'over.saveFailed': 'Could not save your record. Please try again.',

    'win.title': 'You made it home',
    'win.submit': 'SUBMIT TIME',

    'tut.move.speaker': '· MOVING',
    'tut.move': 'You are a stray. The arrow keys walk you down the alleys.',
    'tut.move.touch': 'You are a stray. The stick at the bottom left walks you down the alleys.',
    'tut.goal.speaker': '· HOME',
    'tut.goal': 'Home is the middle of the city. The yellow arrow always points at it.',
    'tut.fish.speaker': '· FISH',
    'tut.fish': 'Fish restore your health. You cannot save them up — you have to keep finding more.',
    'tut.milk.speaker': '· MILK',
    'tut.milk': 'Drink milk and you can jump in whatever direction you are facing.',
    'tut.apartment.speaker': '· REDEVELOPMENT',
    'tut.apartment': 'Yellow tape is where a tower is about to go. Stay out of it.',
    'tut.health.speaker': '· HEALTH',
    'tut.health': 'Health drains even standing still. The bar over your head is the time you have left.',
    'tut.start.speaker': '· GO',
    'tut.start': 'Right — get yourself home!',
    'tut.skip': 'SKIP ▸',
    'tut.hint': '▸ ENTER / CLICK',
    'tut.enemy.speaker': '· ?',
    'tut.enemy': 'Life keeps a crisis or two up its sleeve, heh heh',

    'bark.firstTower': 'So this is redevelopment!',
    'bark.tower':
        "There goes another one...|This one too?|Give me back my alley!|Hey, the road's gone|That was my spot|Soon there'll be nowhere to sit",
    'bark.panic':
        "Help! Run!|Ah %$#%!|$@#^%#&*!|Why is it always me!|Nope nope nope!|@#$%! Get away!|No no no don't!",
    'bark.hurt': 'Ow!|#$%@!|Oh come on!',
    'bark.idle':
        "Where even am I...|Rent went up again|I'd love a place of my own|Why is a deposit so much|I'm hungry...|My legs hurt|Haven't I been down here already?|One room would do me|I want to sleep somewhere warm|This used to be our neighbourhood",
    'bark.taunt':
        "Heh heh heh|Going somewhere?|Got a place to live?|Pay your rent, kitty|Stay right there|Deposit's half a million|Redevelopment waits for no cat|Running won't help you|This is my block now",

    'ending.1': 'Life begins without a rehearsal.\n인생은 리허설 없이 시작된다.',
    'ending.2': 'Using the rough waves of anxiety as our drive\n불안이라는 거친 파도를 동력 삼아',
    'ending.3': 'we simply plunge toward an unknown point.\n우리는 그저 미지의 점을 향해 뛰어든다.',
    'ending.4': 'Even if I were to open my eyes again,\n내가 다시 눈을 뜬다 해도,',
    'ending.5': 'my choice remains the repetition of this very life.\n나의 선택은 바로 이 삶의 반복이다.',
    'ending.skip': '▸  SKIP',
    'credits.return': '▸  SKIP'
};

const DICTS: Record<Language, Dict> = { ko, en };

/**
 * Looks up one line.
 *
 * Falls back to Korean and then to the key itself, so a line that has not been
 * translated yet shows up as text rather than as a blank.
 */
export const t = (key: string): string => {
    const language = getSettings().language;
    return DICTS[language]?.[key] ?? ko[key] ?? key;
};

/** A line that holds several alternatives, split on `|`. */
export const tList = (key: string): string[] => t(key).split('|');

/** React binding: re-renders the component when the language changes. */
export const useTranslation = (): typeof t => {
    const [, bump] = useState(0);

    useEffect(() => subscribe(() => bump((n) => n + 1)), []);

    return t;
};
