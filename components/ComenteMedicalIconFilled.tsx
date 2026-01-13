import Svg, { Path } from 'react-native-svg';

type ComenteMedicalIconFilledProps = {
  size?: number;
  color?: string;
};

export function ComenteMedicalIconFilled({
  size = 24,
  color = '#000',
}: ComenteMedicalIconFilledProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M20.5,0H3.5C1.57,0,0,1.57,0,3.5v13c0,1.93,1.57,3.5,3.5,3.5h3.606l3.897,3.284c.286.253.645.379,1.001.379.353,0,.704-.123.979-.368l3.985-3.295h3.532c1.93,0,3.5-1.57,3.5-3.5V3.5c0-1.93-1.57-3.5-3.5-3.5Zm-4,10.5h-4v4c0,.276-.224.5-.5.5s-.5-.224-.5-.5v-4h-4c-.276,0-.5-.224-.5-.5s.224-.5.5-.5h4v-4c0-.276.224-.5.5-.5s.5.224.5.5v4h4c.276,0,.5.224.5.5s-.224.5-.5.5Z"
        fill={color}
      />
    </Svg>
  );
}
