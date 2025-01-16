import React, { useState, useEffect } from 'react'
import { Pressable, StyleSheet } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
  interpolateColor,
  runOnJS
} from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/MaterialIcons'
import { useTheme } from '../../contexts/theme'
import { useTranslation } from 'react-i18next'

interface ToggleButtonProps {
  isEnabled: boolean
  isAvailable: boolean
  toggleAction: () => void
  testID?: string
  enabledIcon?: string
  disabledIcon?: string
  disabled?: boolean
}

const ToggleButton: React.FC<ToggleButtonProps> = ({
  isEnabled,
  isAvailable,
  toggleAction,
  testID,
  enabledIcon = 'check',
  disabledIcon = 'close',
  disabled = false,
}) => {
  const { ColorPallet } = useTheme()
  const { t } = useTranslation()

  const backgroundColor = useSharedValue(0)
  const iconContainerOffset = useSharedValue(1)

  const animatedBackgroundStyles = useAnimatedStyle(() => {
    return {
      backgroundColor: interpolateColor(
        backgroundColor.value,
        [0, 1],
        [ColorPallet.grayscale.mediumGrey, ColorPallet.brand.primary]
      ),
    }
  })

  const animatedIconContainerStyles = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: withTiming(iconContainerOffset.value, { duration: 200 }) }],
    }
  })

  useEffect(() => {
    iconContainerOffset.value = isEnabled ? 24 : 0
    backgroundColor.value = isEnabled ? 1 : 0
  }, [isEnabled])


  return (
    <Pressable
      accessible
      testID={testID}
      accessibilityLabel={isEnabled ? t('Biometry.On') : t('Biometry.Off')}
      accessibilityRole="switch"
      accessibilityState={{
        checked: isEnabled,
      }}
      onPress={isAvailable && !disabled ? toggleAction : undefined} // Prevent onPress if not available or disabled
      disabled={!isAvailable || disabled}
    >
      <Animated.View
        style={[styles.background, animatedBackgroundStyles]}
      >
        <Animated.View
          style={[styles.iconContainer, animatedIconContainerStyles]}
        >
          <Icon
            name={isEnabled ? enabledIcon : disabledIcon}
            size={15}
            color={isEnabled ? ColorPallet.brand.primary : ColorPallet.grayscale.mediumGrey}
          />
        </Animated.View>
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  background: {
    width: 55,
    height: 30,
    borderRadius: 25,
    padding: 3,
    justifyContent: 'center',
    // opacity: disabled ? 0.5 : 1, // Visual feedback for disabled state
  },
  iconContainer: {
    width: 25,
    height: 25,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  }
})

export default ToggleButton
