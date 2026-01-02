import Svg, { Path } from 'react-native-svg';

type SetaParaBaixoIconProps = {
  size?: number;
  color?: string;
};

export function SetaParaBaixoIcon({
  size = 24,
  color = '#4ade80',
}: SetaParaBaixoIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="m17.807,19.315l-4.043,3.948c-.472.477-1.137.725-1.764.737-.676,0-1.284-.247-1.766-.721l-4.081-3.918c-.199-.191-.205-.508-.014-.707.191-.2.508-.204.707-.015l4.086,3.923c.166.164.361.282.567.353V.5c0-.276.224-.5.5-.5s.5.224.5.5v22.409c.204-.073.396-.192.559-.356l4.049-3.954c.199-.192.516-.188.707.009.193.197.189.514-.008.707Z"
        fill={color}
      />
    </Svg>
  );
}
