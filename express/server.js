'use strict';

import AWS, { updateConfig } from '/config/aws'
import { config } from '/config/environment'
import express from 'express'
import dot from 'express-dot-engine'
import favicon from 'serve-favicon'
import sanitizeHtml from 'sanitize-html'
import {
  getRawEmail,
  processEmail,
  sendReply,
  storeInDynamo,
  getStoredEmail,
  deleteEmailFromDynamo,
  deleteCollectionItemFromDynamo,
  preRender,
  addTimeSince,
  getCollection,
  clearCache
} from '/actions'

const app = express()
const path = require('path');


updateConfig()

app.engine('dot', dot.__express)
app.set('views', './templates')
app.set('view engine', 'dot')

app.use(express.static(path.resolve(__dirname, 'public')))
app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')))

app.get('/', function (req, res) {
  res.render('index');
})

// app.get('/create/:messageId', function (req, res) {
//   var messageId = 'sllumhuve9016e8p4c263t5jntf3jcpcupgf5j01' // large images
//
//   getRawEmail(messageId)
//   .then(processEmail)
//   // .then(storeInDynamo)
//   // .then(sendReply)
//   // .then(result => {
//   //   console.log('stored email:')
//   //   console.log(result)
//   //   res.send(true)
//   // })
//   .catch(e => console.log(e))
// })

app.get('/:messageId/delete/:editKey', (req, res) => {
  // check for collection
  getStoredEmail(req.params.messageId)
  .then(mailObj => {
    // check for match of edit key
    if(mailObj.editKey == req.params.editKey){
      const deleteParams = {
        messageId: req.params.messageId,
        editKey: req.params.editKey
      }

      // delete email from main table
      deleteEmailFromDynamo(deleteParams)
      .then(result => {
        const alert = {
          title: 'Page deleted',
          message: 'Please note that the page may still be cached in your browser.'
        }
        res.render('alert', alert)
        // clear cache
        var cfParams = {
          files: [
            'http://www.publishthis.email/' + result.messageId,
            'https://www.publishthis.email/' + result.messageId
          ]
        }
        clearCache(cfParams)
      })
      .catch(e => {
        console.log(e)
      })

      // check for collection
      if(mailObj.collectionId){
        const deleteCollectionParams = {
          collectionId: mailObj.collectionId,
          messageId: mailObj.messageId,
          timeAdded: mailObj.timeAdded
        }
        // console.log(deleteCollectionParams)
        // delete from collection
        deleteCollectionItemFromDynamo(deleteCollectionParams)
        .then(result => {
          // console.log('DELETED:', result)
        })
        .catch(e => {
          console.log(e);
        })

      }
    }else{
      const alert = {
        title: 'Invalid delete link',
        message: 'It looks like you are trying to delete an email, but the link you have clicked appears to be invalid, or the page no longer exists.'
      }
      res.render('alert', alert)
    }
  })
  .catch(e => {
    console.log(e)
  })
})

app.get('/:messageId', (req, res) => {
  // console.log(req.params)
  getStoredEmail(req.params.messageId)
  .then(preRender)
  .then(mailObj => {
    mailObj.html = mailObj.html.replace(/<p><br \/>\n<\/p>/g, '')
    if(mailObj.to[0].address.startsWith('page')){

      res.render('page', mailObj)
    }else{
      mailObj.timestamp = (new Date(mailObj.timeAdded)).toString()
      res.render('email', mailObj)
    }
  })
  .catch(e => {
    // console.log(e)
    res.render('404')
  })
})

app.get('/c/:collectionId/more/:timeAdded', (req, res) => {
  console.log(req.params)

  var collectionParams = {
    id: req.params.collectionId,
    ExclusiveStartKey: { timeAdded: Number(req.params.timeAdded), collectionId: req.params.collectionId }
  }

  getCollection(collectionParams)
  .then(collection =>{
    res.render('partials/collection-items', collection)
  })
})

app.get('/c/:collectionSlug', (req, res) => {
  // console.log(req.params)

  var slug = req.params.collectionSlug
  var slugArr = slug.split('-')
  var collectionId = slugArr[0]

  var collectionParams = {
    id: collectionId
  }

  if(slugArr.length > 1){
    collectionParams.title = sanitizeHtml(slugArr.slice(1).join(' '), {})
  }else{
    collectionParams.title = ' '
  }

  getCollection(collectionParams)
  .then(collection =>{
    collection.Items = addTimeSince(collection.Items)
    // console.log(collection)
    res.render('collection', collection)
  })
})

app.listen(config.PORT, function () {
  console.log(`Publish this email express app listening on port ${config.PORT}!`)
})