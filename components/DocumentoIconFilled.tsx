import Svg, { Path } from 'react-native-svg';

type DocumentoIconFilledProps = {
  size?: number;
  color?: string;
};

export function DocumentoIconFilled({
  size = 24,
  color = '#000',
}: DocumentoIconFilledProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 2l5 5h-5V4zM8 17v-2h8v2H8zm0-4v-2h8v2H8z"
        fill={color}
      />
    </Svg>
  );
}
