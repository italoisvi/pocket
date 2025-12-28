import Svg, { Path } from 'react-native-svg';

type CasaIconFilledProps = {
  size?: number;
  color?: string;
};

export function CasaIconFilled({
  size = 24,
  color = '#000',
}: CasaIconFilledProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M22,5.735V1.987c0-.553-.447-1-1-1s-1,.447-1,1v2.379L14.797,.855c-1.699-1.146-3.895-1.146-5.594,0L2.204,5.579c-1.38,.93-2.204,2.479-2.204,4.145v9.276c0,2.757,2.243,5,5,5h14c2.757,0,5-2.243,5-5V9.724c0-1.579-.748-3.047-2-3.989Z"
        fill={color}
      />
    </Svg>
  );
}
