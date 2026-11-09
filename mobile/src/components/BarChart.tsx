import { View } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import { colors } from '@/theme';

export interface BarDatum {
  label: string;
  value: number;
}

/** Minimal bar chart rendered from real statistics returned by the API. */
export function BarChart({ data, height = 160, width = 320, accessibilityLabel }: { data: BarDatum[]; height?: number; width?: number; accessibilityLabel: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const gap = 6;
  const labelH = 18;
  const barW = data.length ? (width - gap * (data.length - 1)) / data.length : 0;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <Svg width={width} height={height}>
        {data.map((d, i) => {
          const h = Math.max(d.value > 0 ? 3 : 1, ((height - labelH - 4) * d.value) / max);
          const x = i * (barW + gap);
          return (
            <Rect key={`${d.label}-${i}`} x={x} y={height - labelH - h} width={barW} height={h} rx={Math.min(6, barW / 2)} fill={d.value > 0 ? colors.accent : colors.surfaceHigh} />
          );
        })}
        {data.map((d, i) => (
          <SvgText key={`l-${d.label}-${i}`} x={i * (barW + gap) + barW / 2} y={height - 4} fill={colors.textMuted} fontSize={10} textAnchor="middle">
            {d.label}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}
