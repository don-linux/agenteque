<!--
  Componente de prueba, no de la aplicación: ADV-S04 y ADV-S05 necesitan algo
  trivial con estado propio para aislar lo que miden del resto de la interfaz.
-->
<script lang="ts">
  let count = $state(0)
</script>

<button type="button" onclick={() => (count += 1)}>count is {count}</button>
