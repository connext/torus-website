<template>
  <v-container class="wallet-activity" :class="$vuetify.breakpoint.xsOnly ? 'px-4' : ''">
    <v-layout mt-3 wrap>
      <v-flex xs12 md7>
        <div class="text_2--text font-weight-bold display-1 float-left">{{ t('walletActivity.transactionActivities') }}</div>
      </v-flex>
      <v-flex xs12 md5 :class="$vuetify.breakpoint.xsOnly ? 'mt-7' : ''">
        <v-layout mx-n2>
          <v-flex xs6 px-2>
            <v-menu offset-y>
              <template v-slot:activator="{ on }">
                <div class="d-flex align-center filter-selector pa-2" :class="{ 'theme--dark': $vuetify.theme.isDark }" v-on="on">
                  <v-icon x-small class="text_2--text">$vuetify.icons.activities</v-icon>
                  <span class="ml-1 text_1--text" :class="$vuetify.breakpoint.xsOnly ? 'caption' : 'body-2'">{{ t(selectedAction) }}</span>
                  <v-icon class="ml-auto text_2--text">$vuetify.icons.select</v-icon>
                </div>
              </template>
              <v-card class="pa-3">
                <v-list min-width="190" dense>
                  <v-list-item-group color="torusBrand1">
                    <v-list-item
                      v-for="actionType in actionTypes"
                      :key="actionType.value"
                      :class="selectedAction === actionType.value ? 'active' : ''"
                      @click="selectedAction = actionType.value"
                    >
                      <v-list-item-content>
                        <v-list-item-title>{{ actionType.text }}</v-list-item-title>
                      </v-list-item-content>
                    </v-list-item>
                  </v-list-item-group>
                </v-list>
              </v-card>
            </v-menu>
          </v-flex>
          <v-flex xs6 px-2>
            <v-menu offset-y>
              <template v-slot:activator="{ on }">
                <div class="d-flex align-center filter-selector pa-2" :class="{ 'theme--dark': $vuetify.theme.isDark }" v-on="on">
                  <v-icon class="text_2--text" small>$vuetify.icons.calendar</v-icon>
                  <span class="ml-1 text_1--text" :class="$vuetify.breakpoint.xsOnly ? 'caption' : 'body-2'">{{ t(selectedPeriod) }}</span>
                  <v-icon class="ml-auto text_2--text">$vuetify.icons.select</v-icon>
                </div>
              </template>
              <v-card class="pa-3">
                <v-list min-width="190" dense>
                  <v-list-item-group color="torusBrand1">
                    <v-list-item
                      v-for="period in periods"
                      :key="period.value"
                      :class="selectedPeriod === period.value ? 'active' : ''"
                      @click="selectedPeriod = period.value"
                    >
                      <v-list-item-content>
                        <v-list-item-title>{{ period.text }}</v-list-item-title>
                      </v-list-item-content>
                    </v-list-item>
                  </v-list-item-group>
                </v-list>
              </v-card>
            </v-menu>
          </v-flex>
        </v-layout>
      </v-flex>
      <v-flex xs12 :class="$vuetify.breakpoint.xsOnly ? 'mt-6' : 'mt-7'">
        <TxHistoryTable
          :selected-action="selectedAction"
          :selected-period="selectedPeriod"
          :loading-transactions="loadingPastTransactions || loadingOrders || loadingUserTransactions"
          :transactions="calculateFinalTransactions()"
        />
      </v-flex>
    </v-layout>
  </v-container>
</template>

<script>
/* eslint-disable no-restricted-syntax */
/* eslint-disable guard-for-in */
import log from 'loglevel'
import { mapGetters, mapState } from 'vuex'
import { fromWei, isAddress, toBN, toChecksumAddress } from 'web3-utils'

import TxHistoryTable from '../../components/WalletHistory/TxHistoryTable'
import config from '../../config'
import torus from '../../torus'
import {
  ACTIVITY_ACTION_ALL,
  ACTIVITY_ACTION_RECEIVE,
  ACTIVITY_ACTION_SEND,
  ACTIVITY_ACTION_TOPUP,
  ACTIVITY_PERIOD_ALL,
  ACTIVITY_PERIOD_MONTH_ONE,
  ACTIVITY_PERIOD_MONTH_SIX,
  ACTIVITY_PERIOD_WEEK_ONE,
  ACTIVITY_STATUS_PENDING,
  ACTIVITY_STATUS_SUCCESSFUL,
  ACTIVITY_STATUS_UNSUCCESSFUL,
  COLLECTIBLE_METHOD_SAFE_TRANSFER_FROM,
  CONTRACT_TYPE_ERC20,
  CONTRACT_TYPE_ERC721,
  MAINNET,
  TOKEN_METHOD_TRANSFER_FROM,
} from '../../utils/enums'
import { patch } from '../../utils/httpHelpers'
import { addressSlicer, formatDate, formatSmallNumbers, getEtherScanHashLink, getEthTxStatus, significantDigits } from '../../utils/utils'

export default {
  name: 'WalletHistory',
  components: { TxHistoryTable },
  data() {
    return {
      supportedCurrencies: ['ETH', ...config.supportedCurrencies],
      pastOrders: [],
      selectedAction: ACTIVITY_ACTION_ALL,
      selectedPeriod: ACTIVITY_PERIOD_ALL,
      paymentTx: [],
      pastTx: [],
      loadingPastTransactions: true,
      loadingOrders: true,
    }
  },
  computed: {
    ...mapState({
      loadingUserTransactions: 'loadingUserTransactions',
      selectedCurrency: 'selectedCurrency',
      wallet: 'wallet',
      pastTransactions: 'pastTransactions',
      paymentTxStore: 'paymentTx',
      selectedAddress: 'selectedAddress',
      networkType: 'networkType',
      jwtToken: 'jwtToken',
      assets: 'assets',
      tokenRates: 'tokenRates',
      networkId: 'networkId',
      transactions: 'transactions',
      wallets: (state) => Object.keys(state.wallet),
    }),
    ...mapGetters(['currencyMultiplier']),
    actionTypes() {
      return [
        {
          text: this.t(ACTIVITY_ACTION_ALL),
          value: ACTIVITY_ACTION_ALL,
        },
        {
          text: this.t(ACTIVITY_ACTION_SEND),
          value: ACTIVITY_ACTION_SEND,
        },
        {
          text: this.t(ACTIVITY_ACTION_RECEIVE),
          value: ACTIVITY_ACTION_RECEIVE,
        },
        {
          text: this.t(ACTIVITY_ACTION_TOPUP),
          value: ACTIVITY_ACTION_TOPUP,
        },
      ]
    },
    periods() {
      return [
        {
          text: this.t(ACTIVITY_PERIOD_ALL),
          value: ACTIVITY_PERIOD_ALL,
        },
        {
          text: this.t(ACTIVITY_PERIOD_WEEK_ONE),
          value: ACTIVITY_PERIOD_WEEK_ONE,
        },
        {
          text: this.t(ACTIVITY_PERIOD_MONTH_ONE),
          value: ACTIVITY_PERIOD_MONTH_ONE,
        },
        {
          text: this.t(ACTIVITY_PERIOD_MONTH_SIX),
          value: ACTIVITY_PERIOD_MONTH_SIX,
        },
      ]
    },
  },
  watch: {
    pastTransactions() {
      this.calculatePastTransactions()
    },
    paymentTxStore() {
      this.calculatePaymentTransactions()
    },
  },
  mounted() {
    this.calculatePaymentTransactions()
    this.calculatePastTransactions()
    this.$vuetify.goTo(0)
  },
  methods: {
    getStatusText(status) {
      switch (status) {
        case 'rejected':
        case 'denied':
        case 'unapproved':
        case 'failed':
          return ACTIVITY_STATUS_UNSUCCESSFUL
        case 'confirmed':
        case 'completed':
        case 'complete':
        case 'success':
          return ACTIVITY_STATUS_SUCCESSFUL
        case 'pending':
        case 'submitted':
        case 'processing':
          return ACTIVITY_STATUS_PENDING
        default:
          return ''
      }
    },
    getActionText(activity) {
      // Handling tx from common-api schema and /tx schema separately.
      if (activity.type_name === 'n/a' || activity.type === 'n/a') {
        return `${activity.action === ACTIVITY_ACTION_SEND ? this.t('walletActivity.sent') : this.t('walletActivity.received')} ${
          activity.type_name !== 'n/a' ? activity.type_name : activity.type.toUpperCase()
        }`
      }
      if (activity.type_name || activity.type) {
        return `${activity.action === ACTIVITY_ACTION_SEND ? this.t('walletActivity.sent') : this.t('walletActivity.received')} ${
          activity.type === 'eth' ? activity.type_name.toUpperCase() : activity.type_name
        }`
      }
      return `${`${this.t(activity.action)} ${activity.from}`} `
    },
    getIcon(activity) {
      if (activity.action === ACTIVITY_ACTION_TOPUP) {
        return `provider-${activity.from.toLowerCase()}.svg`
      }
      if (activity.action === ACTIVITY_ACTION_SEND || activity.action === ACTIVITY_ACTION_RECEIVE) {
        if (activity.type === CONTRACT_TYPE_ERC721) {
          return activity.type_image_link // will be an opensea image url
        }
        if (activity.type === CONTRACT_TYPE_ERC20) {
          return `logos/${activity.type_image_link === 'n/a' ? 'eth.svg' : activity.type_image_link}`
        }
        const action = activity.action.split('.')
        return action.length >= 1 ? `$vuetify.icons.coins_${activity.action.split('.')[1].toLowerCase()}` : ''
      }
      return ''
    },
    formatDate(date) {
      return formatDate(date)
    },
    formatTime(time) {
      return time.toTimeString().slice(0, 8)
    },
    calculateFinalTransactions() {
      if (this.loadingPastTransactions || this.loadingOrders || this.loadingUserTransactions) return []
      let finalTx = this.paymentTx
      const transactions = this.calculateTransactions()
      finalTx = [...transactions, ...finalTx, ...this.pastTx]
      finalTx = finalTx.reduce((accumulator, x) => {
        x.actionIcon = this.getIcon(x)
        x.actionText = this.getActionText(x)
        x.statusText = this.getStatusText(x.status)
        x.dateFormatted = this.formatDate(x.date)
        x.timeFormatted = this.formatTime(x.date)
        if (x.etherscanLink === '' || accumulator.findIndex((y) => y.etherscanLink === x.etherscanLink) === -1) accumulator.push(x)
        return accumulator
      }, [])
      return finalTx.sort((a, b) => b.date - a.date) || []
    },
    async calculatePastTransactions() {
      const pastTx = []
      for (const x of this.pastTransactions) {
        // eslint-disable-next-line no-continue
        if (x.network !== this.networkType.host) continue
        let { status } = x
        if (
          x.status !== 'confirmed' &&
          (this.selectedAddress.toLowerCase() === x.from.toLowerCase() || this.selectedAddress.toLowerCase() === x.to.toLowerCase())
        ) {
          // eslint-disable-next-line no-await-in-loop
          status = await getEthTxStatus(x.transaction_hash, torus.web3)
          if (this.selectedAddress.toLowerCase() === x.from.toLowerCase()) this.patchTx(x, status, this.jwtToken)
        }
        let totalAmountString = ''
        if (x.type === CONTRACT_TYPE_ERC721) totalAmountString = x.symbol
        else if (x.type === CONTRACT_TYPE_ERC20) totalAmountString = formatSmallNumbers(Number.parseFloat(x.total_amount), x.symbol, true)
        else totalAmountString = formatSmallNumbers(Number.parseFloat(x.total_amount), 'ETH', true)
        const currencyAmountString =
          x.type === CONTRACT_TYPE_ERC721 ? '' : formatSmallNumbers(Number.parseFloat(x.currency_amount), x.selected_currency, true)
        const finalObject = {
          id: x.created_at.toString(),
          date: new Date(x.created_at),
          from: x.from,
          slicedFrom: addressSlicer(x.from),
          to: x.to,
          slicedTo: addressSlicer(x.to),
          action: this.wallets.includes(x.to) ? ACTIVITY_ACTION_RECEIVE : ACTIVITY_ACTION_SEND,
          totalAmount: x.total_amount,
          totalAmountString,
          currencyAmount: x.currency_amount,
          currencyAmountString,
          amount: `${totalAmountString} / ${currencyAmountString}`,
          status,
          etherscanLink: getEtherScanHashLink(x.transaction_hash, x.network),
          networkType: x.network,
          ethRate: `1 ${x.symbol} = ${significantDigits(Number.parseFloat(x.currency_amount) / Number.parseFloat(x.total_amount))}`,
          currencyUsed: x.selected_currency,
          type: x.type,
          type_name: x.type_name,
          type_image_link: x.type_image_link,
        }
        pastTx.push(finalObject)
      }

      this.loadingPastTransactions = false
      this.pastTx = pastTx
    },
    calculateTransactions() {
      const finalTransactions = []
      for (const tx in this.transactions) {
        const txOld = this.transactions[tx]
        if (txOld.metamaskNetworkId.toString() === this.networkId.toString()) {
          const { methodParams, contractParams, txParams, transactionCategory } = txOld
          let amountTo
          let amountValue
          let totalAmountString
          let totalAmount
          let finalTo
          let tokenRate = 1

          if (contractParams.erc721) {
            // Handling cryptokitties
            if (contractParams.isSpecial) {
              ;[amountTo, amountValue] = methodParams || []
            } else {
              // Rest of the 721s
              ;[, amountTo, amountValue] = methodParams || []
            }

            const { name = '' } = contractParams

            // Get asset name of the 721
            const contract = this.assets[this.selectedAddress].find((x) => x.name.toLowerCase() === name.toLowerCase()) || {}
            log.info(contract, amountValue)
            if (contract) {
              const assetObject = contract.assets.find((x) => x.tokenId.toString() === amountValue.value.toString()) || {}
              log.info(assetObject)
              totalAmountString = (assetObject && assetObject.name) || ''
              finalTo = amountTo && isAddress(amountTo.value) && toChecksumAddress(amountTo.value)
            }
          } else if (contractParams.erc20) {
            // ERC20 transfer
            tokenRate = contractParams.erc20 ? this.tokenRates[txParams.to] : 1
            if (methodParams && Array.isArray(methodParams)) {
              if (transactionCategory === TOKEN_METHOD_TRANSFER_FROM || transactionCategory === COLLECTIBLE_METHOD_SAFE_TRANSFER_FROM) {
                ;[, amountTo, amountValue] = methodParams || []
              } else {
                ;[amountTo, amountValue] = methodParams || []
              }
            }
            totalAmount = amountValue && amountValue.value ? fromWei(toBN(amountValue.value)) : fromWei(toBN(txParams.value))
            totalAmountString = `${significantDigits(Number.parseFloat(totalAmount))} ${contractParams.symbol}`
            finalTo = amountTo && isAddress(amountTo.value) && toChecksumAddress(amountTo.value)
          } else {
            tokenRate = 1
            totalAmount = fromWei(toBN(txParams.value))
            totalAmountString = `${significantDigits(Number.parseFloat(totalAmount))} ETH`
            finalTo = toChecksumAddress(txOld.txParams.to)
          }
          const txObject = {}
          txObject.id = txOld.time.toString()
          txObject.action = this.wallets.includes(txOld.txParams.to) ? ACTIVITY_ACTION_RECEIVE : ACTIVITY_ACTION_SEND
          txObject.date = new Date(txOld.time)
          txObject.from = toChecksumAddress(txOld.txParams.from)
          txObject.slicedFrom = addressSlicer(txOld.txParams.from)
          txObject.to = finalTo
          txObject.slicedTo = addressSlicer(finalTo)
          txObject.totalAmount = totalAmount
          txObject.totalAmountString = totalAmountString
          txObject.currencyAmount = this.currencyMultiplier * txObject.totalAmount * tokenRate
          txObject.currencyAmountString = contractParams.erc721 ? '' : formatSmallNumbers(txObject.currencyAmount, this.selectedCurrency, true)
          txObject.amount = `${txObject.totalAmountString} / ${txObject.currencyAmountString}`
          txObject.status = txOld.status
          txObject.etherscanLink = getEtherScanHashLink(txOld.hash, this.networkType.host)
          txObject.networkType = this.networkType.host
          txObject.ethRate = `1 ${(contractParams && contractParams.symbol) || 'ETH'} = ${significantDigits(
            Number.parseFloat(txObject.currencyAmount) / Number.parseFloat(txObject.totalAmount)
          )}`
          txObject.currencyUsed = this.selectedCurrency
          txObject.type = 'eth'
          if (contractParams && contractParams.erc20) txObject.type = 'erc20'
          else if (contractParams && contractParams.erc721) txObject.type = 'erc721'
          txObject.type_name = contractParams && contractParams.name ? contractParams.name : 'n/a'
          txObject.type_image_link = contractParams && contractParams.logo ? contractParams.logo : 'n/a'
          finalTransactions.push(txObject)
        }
      }
      return finalTransactions
    },
    calculatePaymentTransactions() {
      let paymentTx
      if (this.networkType.host !== MAINNET) paymentTx = []
      else {
        paymentTx = this.paymentTxStore.reduce((accumulator, x) => {
          let action = ''
          if (ACTIVITY_ACTION_TOPUP.includes(x.action.toLowerCase())) action = ACTIVITY_ACTION_TOPUP
          else if (ACTIVITY_ACTION_SEND.includes(x.action.toLowerCase())) action = ACTIVITY_ACTION_SEND
          else if (ACTIVITY_ACTION_RECEIVE.includes(x.action.toLowerCase())) action = ACTIVITY_ACTION_RECEIVE

          accumulator.push({
            id: x.id,
            date: new Date(x.date),
            from: x.from,
            slicedFrom: x.slicedFrom,
            action,
            to: x.to,
            slicedTo: x.slicedTo,
            totalAmount: x.totalAmount,
            totalAmountString: x.totalAmountString,
            currencyAmount: x.currencyAmount,
            currencyAmountString: x.currencyAmountString,
            amount: x.amount,
            ethRate: x.ethRate,
            status: x.status.toLowerCase(),
            etherscanLink: x.etherscanLink || '',
            currencyUsed: x.currencyUsed,
          })

          return accumulator
          // }
        }, [])
      }
      this.paymentTx = paymentTx
      this.loadingOrders = false
    },
    patchTx(x, status, jwtToken) {
      // patch tx
      patch(
        `${config.api}/transaction`,
        {
          id: x.id,
          status,
        },
        {
          headers: {
            Authorization: `Bearer ${jwtToken}`,
            'Content-Type': 'application/json; charset=utf-8',
          },
        }
      )
        .then((response) => log.info('successfully patched', response))
        .catch((error) => log.error('unable to patch tx', error))
    },
  },
}
</script>

<style lang="scss" scoped>
@import 'WalletHistory.scss';
</style>
