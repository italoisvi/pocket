import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useTheme } from '@/lib/theme';
import { getTimeAgo } from '@/lib/news-service';
import { getSourceLogo, cleanSourceName } from '@/lib/news-sources';
import { trackNewsClick } from '@/lib/news-tracking';
import type { NewsItem } from '@/types/feed';

//
// NewsCard
//
// A redesigned news card that matches the updated look and feel of the Pocket feed.
// The card shows an optional image at the top with a gradient overlay, a category badge,
// the headline with optional keyword highlighting, an optional summary, and a footer
// displaying the news source and the relative publication time.

type NewsCardProps = {
  news: NewsItem;
  onPress?: () => void;
};

export function NewsCard({ news, onPress }: NewsCardProps) {
  const { theme, isDark } = useTheme();

  // Handle press with tracking
  const handlePress = () => {
    // Track the click (fire and forget)
    if (news.url) {
      trackNewsClick(news.url, news.title, news.source);
    }
    // Call the original onPress
    onPress?.();
  };

  // Detect keywords to highlight inside the title. Keep existing keywords for emphasis.
  const highlightKeywords = [
    'digital',
    'innovation',
    'fund',
    'aplicações',
    'economia',
  ];
  const titleUpper = news.title.toUpperCase();

  const renderTitle = () => {
    let highlightedText: React.ReactNode = null;
    for (const keyword of highlightKeywords) {
      const keywordUpper = keyword.toUpperCase();
      if (titleUpper.includes(keywordUpper)) {
        const parts = titleUpper.split(keywordUpper);
        if (parts.length > 1) {
          highlightedText = (
            <>
              {parts[0]}
              <Text style={styles.titleHighlight}>{keywordUpper}</Text>
              {parts.slice(1).join(keywordUpper)}
            </>
          );
          break;
        }
      }
    }
    return (
      <Text
        style={[styles.title, { color: theme.text }]}
        numberOfLines={3}
        ellipsizeMode="tail"
      >
        {highlightedText || news.title}
      </Text>
    );
  };

  const Container = onPress ? TouchableOpacity : View;
  const containerOnPress = onPress ? handlePress : undefined;

  // Calculate relative time (e.g., "há 2h") for the news timestamp.
  const timeAgo = getTimeAgo(news.publishedAt);

  // Get source logo if available
  const sourceLogo = getSourceLogo(news.source);

  return (
    <Container
      style={[
        styles.card,
        {
          backgroundColor: theme.card,
          borderColor: theme.cardBorder,
          shadowColor: isDark ? '#fff' : '#000',
        },
      ]}
      onPress={containerOnPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      {/* Header com logo da fonte (estilo Instagram) */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          {sourceLogo ? (
            <Image source={sourceLogo} style={styles.sourceLogo} />
          ) : (
            <View
              style={[
                styles.sourceLogoPlaceholder,
                { backgroundColor: theme.primary },
              ]}
            >
              <Text style={styles.sourceLogoText}>
                {news.source.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.headerTextContainer}>
            <Text
              style={[styles.headerSourceName, { color: theme.text }]}
              numberOfLines={1}
            >
              {cleanSourceName(news.source)}
            </Text>
            <Text style={[styles.headerTime, { color: theme.textSecondary }]}>
              {timeAgo}
            </Text>
          </View>
        </View>
      </View>

      {/* Top image section */}
      {news.imageUrl ? (
        <ImageBackground
          source={{ uri: news.imageUrl }}
          style={styles.imageContainer}
          imageStyle={styles.imageStyle}
        />
      ) : (
        // Placeholder when there is no image
        <View
          style={[
            styles.imageContainer,
            { backgroundColor: isDark ? '#1F2937' : '#F3F4F6' },
          ]}
        />
      )}
      {/* Main content */}
      <View style={styles.contentWrapper}>
        {renderTitle()}
        {news.summary ? (
          <Text
            style={[styles.summary, { color: theme.textSecondary }]}
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {news.summary}
          </Text>
        ) : null}
      </View>
    </Container>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 0,
    overflow: 'hidden',
    borderWidth: 1,
    marginHorizontal: 0,
    marginBottom: 12,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  sourceLogo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    resizeMode: 'cover',
  },
  sourceLogoPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sourceLogoText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'DMSans-Bold',
  },
  headerTextContainer: {
    marginLeft: 10,
    flex: 1,
  },
  headerSourceName: {
    fontSize: 14,
    fontFamily: 'DMSans-SemiBold',
  },
  headerTime: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
  },
  imageContainer: {
    height: 300,
    justifyContent: 'flex-end',
  },
  imageStyle: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  contentWrapper: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: {
    fontSize: 18,
    fontFamily: 'DMSans-Bold',
    marginBottom: 8,
  },
  titleHighlight: {
    color: '#3B82F6',
    backgroundColor: 'rgba(59,130,246,0.15)',
    paddingHorizontal: 4,
  },
  summary: {
    fontSize: 14,
    fontFamily: 'DMSans-Regular',
    lineHeight: 20,
  },
});
