import alegreyaSansRegularUrl from "../../assets/cards/fonts/AlegreyaSans-Regular.ttf?url";
import alegreyaSansMediumUrl from "../../assets/cards/fonts/AlegreyaSans-Medium.ttf?url";
import alegreyaSansBoldUrl from "../../assets/cards/fonts/AlegreyaSans-Bold.ttf?url";
import cormorantGaramondRegularUrl from "../../assets/cards/fonts/CormorantGaramond-Regular.ttf?url";
import cormorantGaramondMediumUrl from "../../assets/cards/fonts/CormorantGaramond-Medium.ttf?url";
import cormorantGaramondSemiBoldUrl from "../../assets/cards/fonts/CormorantGaramond-SemiBold.ttf?url";
import cormorantGaramondBoldUrl from "../../assets/cards/fonts/CormorantGaramond-Bold.ttf?url";
import dmSerifDisplayRegularUrl from "../../assets/cards/fonts/DMSerifDisplay-Regular.ttf?url";
import greatVibesRegularUrl from "../../assets/cards/fonts/GreatVibes-Regular.ttf?url";
import loraRegularUrl from "../../assets/cards/fonts/Lora-Regular.ttf?url";
import loraBoldUrl from "../../assets/cards/fonts/Lora-Bold.ttf?url";
import nunitoSansRegularUrl from "../../assets/cards/fonts/NunitoSans-Regular.ttf?url";
import nunitoSansSemiBoldUrl from "../../assets/cards/fonts/NunitoSans-SemiBold.ttf?url";
import nunitoSansBoldUrl from "../../assets/cards/fonts/NunitoSans-Bold.ttf?url";
import parisienneRegularUrl from "../../assets/cards/fonts/Parisienne-Regular.ttf?url";
import playfairDisplayRegularUrl from "../../assets/cards/fonts/PlayfairDisplay-Regular.ttf?url";
import playfairDisplayBoldUrl from "../../assets/cards/fonts/PlayfairDisplay-Bold.ttf?url";

export function buildCardFontFaceCss() {
  return `
@font-face {
  font-family: 'Alegreya Sans';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('${alegreyaSansRegularUrl}') format('truetype');
}
@font-face {
  font-family: 'Alegreya Sans';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url('${alegreyaSansMediumUrl}') format('truetype');
}
@font-face {
  font-family: 'Alegreya Sans';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('${alegreyaSansBoldUrl}') format('truetype');
}
@font-face {
  font-family: 'Cormorant Garamond';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('${cormorantGaramondRegularUrl}') format('truetype');
}
@font-face {
  font-family: 'Cormorant Garamond';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url('${cormorantGaramondMediumUrl}') format('truetype');
}
@font-face {
  font-family: 'Cormorant Garamond';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url('${cormorantGaramondSemiBoldUrl}') format('truetype');
}
@font-face {
  font-family: 'Cormorant Garamond';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('${cormorantGaramondBoldUrl}') format('truetype');
}
@font-face {
  font-family: 'DM Serif Display';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('${dmSerifDisplayRegularUrl}') format('truetype');
}
@font-face {
  font-family: 'Great Vibes';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('${greatVibesRegularUrl}') format('truetype');
}
@font-face {
  font-family: 'Lora';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('${loraRegularUrl}') format('truetype');
}
@font-face {
  font-family: 'Lora';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('${loraBoldUrl}') format('truetype');
}
@font-face {
  font-family: 'Nunito Sans';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('${nunitoSansRegularUrl}') format('truetype');
}
@font-face {
  font-family: 'Nunito Sans';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url('${nunitoSansSemiBoldUrl}') format('truetype');
}
@font-face {
  font-family: 'Nunito Sans';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('${nunitoSansBoldUrl}') format('truetype');
}
@font-face {
  font-family: 'Parisienne';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('${parisienneRegularUrl}') format('truetype');
}
@font-face {
  font-family: 'Playfair Display';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('${playfairDisplayRegularUrl}') format('truetype');
}
@font-face {
  font-family: 'Playfair Display';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('${playfairDisplayBoldUrl}') format('truetype');
}
svg {
  text-rendering: geometricPrecision;
  -webkit-font-smoothing: antialiased;
}
`.trim();
}
