import Svg, { Path } from 'react-native-svg';

type CheckIconProps = {
  size?: number;
  color?: string;
};

export function CheckIcon({ size = 24, color = '#000' }: CheckIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M23.855,6.353l-13.883,14c-.419,.418-.973,.647-1.562,.647s-1.144-.229-1.561-.646L.152,13.859c-.198-.192-.203-.509-.012-.707,.194-.198,.51-.203,.707-.012l6.703,6.5c.469,.467,1.256,.461,1.713,.006L23.145,5.647c.195-.194,.511-.197,.708-.003,.195,.195,.197,.512,.003,.708Z"
        fill={color}
      />
    </Svg>
  );
}
