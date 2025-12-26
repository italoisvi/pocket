import Svg, { Path } from 'react-native-svg';

type BotaoMovelIconProps = {
  size?: number;
  color?: string;
};

export function BotaoMovelIcon({
  size = 24,
  color = '#000',
}: BotaoMovelIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15.5,24h-7c-2.481,0-4.5-2.019-4.5-4.5V4.5C4,2.019,6.019,0,8.5,0h7c2.481,0,4.5,2.019,4.5,4.5v15c0,2.481-2.019,4.5-4.5,4.5ZM8.5,1c-1.93,0-3.5,1.57-3.5,3.5v15c0,1.93,1.57,3.5,3.5,3.5h7c1.93,0,3.5-1.57,3.5-3.5V4.5c0-1.93-1.57-3.5-3.5-3.5h-7Zm5.5,19.5c0-.276-.224-.5-.5-.5h-3c-.276,0-.5,.224-.5,.5s.224,.5,.5,.5h3c.276,0,.5-.224,.5-.5Z"
        fill={color}
      />
    </Svg>
  );
}
