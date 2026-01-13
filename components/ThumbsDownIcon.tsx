import Svg, { Path } from 'react-native-svg';

type ThumbsDownIconProps = {
  size?: number;
  color?: string;
};

export function ThumbsDownIcon({
  size = 24,
  color = '#000',
}: ThumbsDownIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M17 2V13M22 11V4C22 2.89543 21.1046 2 20 2H6.57381C5.09298 2 3.83377 3.0803 3.60862 4.54379L2.53171 11.5438C2.25208 13.3611 3.65824 15 5.49684 15H9C9.55228 15 10 15.4477 10 16V19.5342C10 20.896 11.104 22 12.4658 22C12.7907 22 13.085 21.8087 13.2169 21.5119L16.7361 13.5939C16.8966 13.2327 17.2547 13 17.6499 13H20C21.1046 13 22 12.1046 22 11Z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
