'use strict'

/**
 * LinkNodeFlat:
 * name: string
 * url?: string
 * parent?: string
 * 
 * LinkNode:
 * name: string
 * url?: string
 * children?: LinkNode[]
 */

const CURRENT_LIST_VERSION = 'links-v1'

let toggleFormBtn = document.getElementById('toggle-form-btn')
let form = document.getElementById('newlink-form')
let nameField = document.getElementById('newlink-name')
let urlField = document.getElementById('newlink-url')
let parentField = document.getElementById('newlink-parent')
let listEl = document.getElementById('list-group')

let formOpen = false;
// pre-processed
let rawList = []
let names = []
// post-processed
let root = {
  name: 'Root',
  children: []
}
let createdTable = {}


// initialization

chrome.storage.sync.get(CURRENT_LIST_VERSION, result => {
  console.log('Fetched initial list:', result)
  if (result[CURRENT_LIST_VERSION] == null) {
    save([])
    rawList = []
    names = []
  } else {
    rawList = result[CURRENT_LIST_VERSION]
    names = rawList.map( item => item.name )
  }

  let tree = makeTree(rawList)
  renderTree(tree)
})

// listeners 

toggleFormBtn.addEventListener('click', toggleForm)

form.addEventListener('submit', (e) => {
  e.preventDefault()
  
  // validate
  let errorMessage

  let name = nameField.value.trim()
  let url = urlField.value.trim()
  let parent = parentField.value.trim()

  if (name.length == 0)
    errorMessage = 'Name must be populated'
  else if (!validName(name))
    errorMessage = 'Name already taken'
  else if (url.length > 0 && !validURL(url))
    errorMessage = 'URL format invalid'
  else if (parent.length > 0 && !validParent(parent))
    errorMessage = 'Parent does not exist'

  if (errorMessage) {
    alert(errorMessage)
    return
  }

  // save
  rawList.push({
    name: name,
    url: url || undefined,
    parent: parent || undefined,
  })
  
  toggleForm()
  save(rawList)

  clearForm()
})

chrome.storage.onChanged.addListener((changes, namespace) => {
  console.log(changes, namespace)
  for (let key in changes) {
    switch (key) {
      case CURRENT_LIST_VERSION:
        let list = changes[key].newValue
        rawList = list
        names = list.map( item => item.name )
        // honestly we could just store the list in the structure we want but it's less fun
        // plus to get flat maps of parent names and such, we would have to traverse anyway
        let tree = makeTree(list)
        renderTree(tree)
      break
      default:
        // nothing really to do here, it's an old version of this list. maybe we do "auto migration"
      break
    }
  }
});


// utils

function removeLeaf(node) {
  rawList.splice(rawList.indexOf(node), 1)
  save(rawList)
}

function toggleForm() {
  formOpen = !formOpen

  if (formOpen) {
    toggleFormBtn.innerText = '[\u2212]'
    form.classList.remove('display-none')
  } else {
    toggleFormBtn.innerText = '[+]'
    form.classList.add('display-none')
  }

  renderTree(root)
}

function save(list) {
  // clone to break references
  let cloneList = JSON.parse(JSON.stringify(list))
  // clean
  cloneList.forEach( n => delete n.children )

  chrome.storage.sync.set({[CURRENT_LIST_VERSION]: cloneList}, () => console.log('saved'))
}

// takes an array of LinkNodeFlat and turns it into a tree of LinkNodes
function makeTree(rawList) {
  let cloneList = rawList.slice(0)
  root = {
    name: 'Root',
    children: []
  }
  // simplify into 2 step process: populate all the root nodes first then figure out the rest.
  let nonrootList = []
  for (let item of cloneList) {
    if (item.parent != null)
      nonrootList.push(item)
    else
      root.children.push(item)
  }

  // naive implementation
  createdTable = {}
  root.children.forEach(node => {
    createdTable[node.name] = node
  })
  
  let safetyCount = 0
  while (nonrootList.length > 0) {
    if (safetyCount > 2000) {
      console.error('Had to break early during tree construction due to missing parent')
      break
    }
    let node = nonrootList.pop()
    let parent = createdTable[node.parent]

    if (parent) {
      parent.children = parent.children || []
      parent.children.push(node)
      createdTable[node.name] = node
    } else {
      // put it back on the queue if we didn't find the parent node, we will try it again later.
      nonrootList.unshift(node)
    }
    safetyCount++
  }

  return root
}

function renderTree(tree) {
  console.log('Rendering tree', tree)
  // clear old list from dom
  while (listEl.firstChild)
    listEl.removeChild(listEl.lastChild)

  let queue = tree.children.slice(0)
  while (queue.length) {
    let node = queue.shift()
    if (nodeHasChildren(node))
      queue = queue.concat(node.children)

    let parentEl = node.parent ? document.getElementById('listchild-sub-' + node.parent): listEl
    
    let childEl = document.createElement('li')
    childEl.id = 'listchild-' + node.name
    childEl.className = nodeHasChildren(node) ? `tree-item text-bolded` : `tree-item text-normal`
    let contentNode = node.url
      ? htmlToElement(`<span><a href="${node.url}">${node.name}</a></span>`)
      : htmlToElement(`<span>${node.name}</span>`)
    childEl.appendChild(contentNode)
    if (formOpen && !nodeHasChildren(node)) {
      let delEl = htmlToElement(`<a href="#">[\u2212]</a>`)
      delEl.addEventListener('click', () => {
        removeLeaf(node)
      })
      childEl.appendChild(delEl)
    }
    parentEl.appendChild(childEl)

    if (nodeHasChildren(node)) {
      let subEl = document.createElement('ul')
      subEl.id = 'listchild-sub-' + node.name
      subEl.className = `tree-list`
      childEl.appendChild(subEl)
    }

  }
}

function htmlToElement(html) {
  var template = document.createElement('template');
  html = html.trim(); // Never return a text node of whitespace as the result
  template.innerHTML = html;
  return template.content.removeChild(template.content.firstChild);
}


function clearForm() {
  nameField.value = ''
  urlField.value = ''
  parentField.value = ''
}

// ensures the name isn't already taken
function validName(str) {
  return !names.includes(str)
}

// ensures the name is already taken
function validParent(str) {
  return names.includes(str)
}

function validURL(str) {
  var pattern = new RegExp('^(https?:\\/\\/)?'+ // protocol
    '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|'+ // domain name
    '((\\d{1,3}\\.){3}\\d{1,3}))'+ // OR ip (v4) address
    '(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*'+ // port and path
    '(\\?[;&a-z\\d%_.~+=-]*)?'+ // query string
    '(\\#[-a-z\\d_]*)?$','i'); // fragment locator
  return !!pattern.test(str);
}

function nodeHasChildren(node) {
  return Boolean(node.children && node.children.length > 0)
}