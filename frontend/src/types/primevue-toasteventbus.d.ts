declare module 'primevue/toasteventbus' {
  const ToastEventBus: {
    emit(event: string, payload: unknown): void
  }

  export default ToastEventBus
}
