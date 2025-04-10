import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Keyboard, StyleSheet, Text, View } from 'react-native'
import Button, { ButtonType } from '../components/buttons/Button'
import PINInput from '../components/inputs/PINInput'
import { InfoBoxType } from '../components/misc/InfoBox'
import PopupModal from '../components/modals/PopupModal'
import KeyboardView from '../components/views/KeyboardView'
import { minPINLength } from '../constants'
import { useAnimatedComponents } from '../contexts/animated-components'
import { useAuth } from '../contexts/auth'
import { useTheme } from '../contexts/theme'
import { testIdWithKey } from '../utils/testable'
import { InlineMessageProps } from '../components/inputs/InlineErrorText'

interface Props {
  setAuthenticated: (status: boolean) => void
  usage?: PINEntryUsage
  onCancelAuth?: React.Dispatch<React.SetStateAction<boolean>>
}

export enum PINEntryUsage {
  PINCheck,
  ChangeBiometrics,
}

const PINVerify: React.FC<Props> = ({ setAuthenticated, usage = PINEntryUsage.PINCheck, onCancelAuth }) => {
  const { t } = useTranslation()
  const { verifyPIN } = useAuth()
  const [PIN, setPIN] = useState<string>('')
  const [continueDisabled, setContinueDisabled] = useState(false)
  const [loading, setLoading] = useState(false)
  const [alertModalVisible, setAlertModalVisible] = useState<boolean>(false)
  const { ColorPallet, TextTheme } = useTheme()
  const { ButtonLoading } = useAnimatedComponents()
  const [inlineMessageField, setInlineMessageField] = useState<InlineMessageProps>()
  // Temporary until all use cases are built with the new design
  const isNewDesign = usage === PINEntryUsage.ChangeBiometrics

  useEffect(() => {
    setInlineMessageField(undefined)
  }, [PIN])

  const clearAlertModal = useCallback(() => {
      setAlertModalVisible(false)
      setAuthenticated(false)
  }, [setAlertModalVisible, setAuthenticated])

  const onPINInputCompleted = useCallback(
    async () => {
      Keyboard.dismiss()
      setLoading(true)
      setContinueDisabled(true)
      const isPINVerified = await verifyPIN(PIN)
      if (isPINVerified) {
        setAuthenticated(true)
      } else {
        setAlertModalVisible(true)
      }
      setLoading(false)
      setContinueDisabled(false)
    },
    [verifyPIN, setContinueDisabled, setLoading, setAuthenticated, setContinueDisabled, PIN, Keyboard]
  )

  const inputLabelText = {
    [PINEntryUsage.ChangeBiometrics]: t('PINEnter.ChangeBiometricsInputLabel'),
    [PINEntryUsage.PINCheck]: t('PINEnter.AppSettingChangedEnterPIN'),
  }

  const inputTestId = {
    [PINEntryUsage.ChangeBiometrics]: 'BiometricChangedEnterPIN',
    [PINEntryUsage.PINCheck]: 'AppSettingChangedEnterPIN',
  }

  const primaryButtonText = {
    [PINEntryUsage.ChangeBiometrics]: t('Global.Continue'),
    [PINEntryUsage.PINCheck]: t('PINEnter.AppSettingSave'),
  }

  const primaryButtonTestId = {
    [PINEntryUsage.ChangeBiometrics]: 'Continue',
    [PINEntryUsage.PINCheck]: 'AppSettingSave',
  }

  const helpText = {
    [PINEntryUsage.ChangeBiometrics]: t('PINEnter.ChangeBiometricsSubtext'),
    [PINEntryUsage.PINCheck]: t('PINEnter.AppSettingChanged'),
  }

  const isContinueDisabled = (continueDisabled || PIN.length < minPINLength)

  return (
    <KeyboardView>
      <View style={[style.screenContainer, { backgroundColor: ColorPallet.brand.primaryBackground, justifyContent: isNewDesign ? 'flex-start' : 'space-between' }]}>
          {usage === PINEntryUsage.ChangeBiometrics && <Text 
            style={{
              ...TextTheme.headingTwo,
              marginTop: isNewDesign ? 20 : 0,
              marginBottom: isNewDesign ? 40 : 20,
            }}
          >
          {t('PINEnter.ChangeBiometricsHeader')}
          </Text>}
          <Text style={[style.helpText, { ...TextTheme.normal, marginBottom: isNewDesign ? 40 : 16 }]}>{helpText[usage]}</Text>
        <Text style={{ ...TextTheme.bold, marginBottom: isNewDesign ? 20 : 4 }}>
          {inputLabelText[usage]}
          {usage === PINEntryUsage.ChangeBiometrics && <Text style={{ ...TextTheme.caption }}>{` `}{t('PINEnter.ChangeBiometricsInputLabelParenthesis')}</Text>}
        </Text>
        <PINInput
          onPINChanged={(p: string) => {
            setPIN(p)
            if (p.length === minPINLength) {
              Keyboard.dismiss()
            }
          }}
          testID={testIdWithKey(inputTestId[usage])}
          accessibilityLabel={inputLabelText[usage]}
          autoFocus={true}
          inlineMessage={inlineMessageField}
        />
        <View style={style.buttonContainer}>
          <Button
            title={primaryButtonText[usage]}
            buttonType={ButtonType.Primary}
            testID={testIdWithKey(primaryButtonTestId[usage])}
            disabled={isContinueDisabled}
            accessibilityLabel={primaryButtonText[usage]}
            onPress={async () => {
              await onPINInputCompleted()
            }}
          >
            {loading && <ButtonLoading />}
          </Button>
        </View>
        {usage === PINEntryUsage.PINCheck && (
          <View style={[style.buttonContainer, { marginTop: 10 }]}>
            <Button
              title={t('PINEnter.AppSettingCancel')}
              buttonType={ButtonType.Secondary}
              testID={testIdWithKey('AppSettingCancel')}
              accessibilityLabel={t('PINEnter.AppSettingCancel')}
              onPress={() => onCancelAuth?.(false)}
            />
          </View>
        )}
      </View>
      {alertModalVisible && (
        <PopupModal
          notificationType={InfoBoxType.Info}
          title={t('PINEnter.IncorrectPIN')}
          onCallToActionLabel={t('Global.Okay')}
          onCallToActionPressed={clearAlertModal}
        />
      )}
    </KeyboardView>
  )
}

const style = StyleSheet.create({
  screenContainer: {
    height: '100%',
    padding: 20,
  },
  buttonContainer: {
    width: '100%',
  },
  helpText: {
    alignSelf: 'auto',
    textAlign: 'left',
  },
  modalText: {
    marginVertical: 5,
  },
})

export default PINVerify
