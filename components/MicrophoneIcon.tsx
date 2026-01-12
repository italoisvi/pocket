import Svg, { Path } from 'react-native-svg';

type MicrophoneIconProps = {
  size?: number;
  color?: string;
};

export function MicrophoneIcon({
  size = 24,
  color = '#000',
}: MicrophoneIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 1C10.3431 1 9 2.34315 9 4V12C9 13.6569 10.3431 15 12 15C13.6569 15 15 13.6569 15 12V4C15 2.34315 13.6569 1 12 1Z"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M5 10V12C5 15.866 8.13401 19 12 19C15.866 19 19 15.866 19 12V10"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M12 19V23M12 23H8M12 23H16"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
